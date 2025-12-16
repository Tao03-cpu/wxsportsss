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
        role: 'user',
        stats: { todaySteps: 0, weekDuration: 0, totalCheckIns: 0 },
        createTime: db.serverDate()
      }
      try { await col.add({ data: profile }) } catch (_) {}
    }
    // 如果系统还没有管理员，首个登录用户自动成为管理员（初始化引导）
    try {
      const adminCount = await col.where({ role: 'admin' }).count();
      if ((adminCount && adminCount.total === 0) || (!adminCount && !res.data.length)) {
        await col.where({ _openid: openid }).update({ data: { role: 'admin', updateTime: db.serverDate() } });
      }
    } catch (_) {}
    const prof = await col.where({ _openid: openid }).limit(1).get()
    let profile = prof.data[0] || { _openid: openid, role: 'user' }
    if (!profile.role) {
      try { await col.where({ _openid: openid }).update({ data: { role: 'user', updateTime: db.serverDate() } }) } catch(_) {}
      profile.role = 'user'
    }
    return { code: 200, openid, data: profile }
  } catch (e) {
    return { code: 200, openid, data: { _openid: openid, role: 'user' } }
  }
}
