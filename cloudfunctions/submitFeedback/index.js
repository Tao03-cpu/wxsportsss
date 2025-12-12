// cloudfunctions/submitFeedback/index.js
//反馈
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-3g5evs3cb978a9b3' })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { type, content, contact } = event 

  if (!content || content.length < 5) {
    return { code: 400, msg: '反馈内容太短' }
  }

  try {
    await db.collection('feedback').add({
      data: {
        _openid: openid,
        type: type, 
        content: content, 
        contact: contact, 
        status: 'pending', 
        submitTime: new Date()
      }
    })
    return { code: 200, msg: '反馈提交成功' }
  } catch (err) {
    console.error('提交反馈失败', err)
    return { code: 500, msg: '提交反馈失败', error: err }
  }
}