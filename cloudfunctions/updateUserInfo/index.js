// 引入云开发 SDK
const cloud = require('wx-server-sdk')
cloud.init({ env: "cloud1-3g5evs3cb978a9b3" })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // event 包含前端传入的 userInfo (昵称和头像)
  const { userInfo } = event

  if (!userInfo || !userInfo.nickName || !userInfo.avatarUrl) {
    return { code: 400, msg: '缺少用户信息参数' } // 检查参数完整性
  }

  try {
    // 数据库更新操作：根据 OpenID 查找用户并更新资料
    const result = await db.collection('users').where({
      _openid: openid
    }).update({
      data: {
        nickname: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        updateTime: new Date()
      }
    })

    if (result.stats.updated > 0) {
      return { code: 200, msg: '用户信息更新成功' }
    } else {
      return { code: 404, msg: '用户记录未找到' }
    }

  } catch (err) {
    return { code: 500, msg: '数据库更新失败', error: err }
  }
}