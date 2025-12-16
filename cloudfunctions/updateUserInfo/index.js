const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const { userInfo } = event

  if (!userInfo || !userInfo.nickName || !userInfo.avatarUrl) {
    return { code: 400, msg: '缺少用户信息参数' } // 检查参数完整性
  }

  try {
    const col = db.collection('user_profiles')
    const result = await col.where({ _openid: openid }).update({
      data: { nickname: userInfo.nickName, avatarUrl: userInfo.avatarUrl, updateTime: new Date() }
    })

    if (result.stats.updated > 0) {
      return { code: 200, msg: '用户信息更新成功' }
    } else {
      await col.add({ data: { _openid: openid, nickname: userInfo.nickName, avatarUrl: userInfo.avatarUrl, role: 'user', updateTime: new Date(), createTime: new Date() } })
      return { code: 200, msg: '用户信息创建成功' }
    }

  } catch (err) {
    return { code: 500, msg: '数据库更新失败', error: err }
  }
}
