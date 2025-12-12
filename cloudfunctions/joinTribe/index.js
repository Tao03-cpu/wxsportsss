const cloud = require('wx-server-sdk')
cloud.init({ env: "cloud1-3g5evs3cb978a9b3" })
const db = cloud.database()
const _ = db.command // 数据库操作符

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { tribeId } = event || {}

  try {
    if (!tribeId) {
      return { code: 400, msg: '缺少部落ID' }
    }

    // 1) 记录用户与部落的关系
    const relRes = await db.collection('user_tribe').where({ _openid: openid }).limit(1).get()
    if (relRes.data.length > 0) {
      // 已有关联则更新为新的部落
      await db.collection('user_tribe').doc(relRes.data[0]._id).update({
        data: { tribeId, role: '成员', updateTime: new Date() }
      })
    } else {
      await db.collection('user_tribe').add({
        data: { _openid: openid, tribeId, role: '成员', createTime: new Date() }
      })
    }

    // 2) 更新用户标签与加入标识
    await db.collection('users').where({ _openid: openid }).update({
      data: { is_joined: true, tribe_tags: _.push('燃动部落·正式成员') }
    })

    // 3) 增加部落人数
    await db.collection('tribe').doc(tribeId).update({ data: { memberCount: _.inc(1) } })

    return { code: 200, msg: '加入成功' }
  } catch (err) {
    return {
      code: 500,
      msg: '操作失败',
      err: err
    }
  }
}
