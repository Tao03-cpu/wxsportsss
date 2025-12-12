const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-3g5evs3cb978a9b3' })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event || {}

  if (action === 'saveReminderSettings') {
    const { remindersOn = true, reminderTime = '20:00' } = event
    try {
      await db.collection('user_profiles').where({ _openid: openid }).update({ data: { remindersOn, reminderTime, updateTime: new Date() } })
      return { code: 200 }
    } catch (e) {
      return { code: 500, msg: 'save failed', error: e.toString() }
    }
  }

  if (action === 'sendDailyReminder') {
    const { templateId, page = 'pages/sports/sports' } = event
    if (!templateId) return { code: 400, msg: 'missing templateId' }
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId,
        page,
        data: {
          thing1: { value: '今日打卡提醒' },
          time2: { value: new Date().toLocaleString('zh-CN', { hour12: false }) },
          thing3: { value: '来一组运动，完成目标！' }
        }
      })
      return { code: 200 }
    } catch (e) {
      return { code: 500, msg: 'send failed', error: e.toString() }
    }
  }

  return { code: 400, msg: 'unknown action' }
}
