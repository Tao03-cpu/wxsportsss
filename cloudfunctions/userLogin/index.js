const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const col = db.collection('user_profiles')
    const res = await col.where({ _openid: openid }).limit(1).get()
    if (res.data.length === 0) {
      const profile = {
        _openid: openid,
        nickname: '运动达人',
        avatarUrl: '',
        genderIndex: 0,
        signature: '我的运动，我做主！',
        stats: { todaySteps: 0, weekDuration: 0, totalCheckIns: 0 },
        createTime: db.serverDate()
      }
      try { await col.add({ data: profile }) } catch (_) {}
    }
  } catch (e) {}

  return { code: 200, openid, data: { _openid: openid } }
}
