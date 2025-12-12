// cloudfunctions/updateProfile/index.js
//更新资料
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-3g5evs3cb978a9b3' })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const { action, profileData } = event

  const profileCollection = db.collection('user_profiles')
  
  try {
    if (action === 'fetch') {
      const res = await profileCollection.where({_openid: openid}).get()
      
      const defaultProfile = {
        // 修改：默认为空，由前端决定显示什么默认图，避免云存储链接失效导致破图
        avatarUrl: '', 
        nickname: '运动达人',
        genderIndex: 0,
        signature: '我的运动，我做主！'
      }
      
      if (res.data.length > 0) {
          return { code: 200, profile: res.data[0] }
      } else {
          return { code: 200, profile: {...defaultProfile, _openid: openid} }
      }
      
    } else if (action === 'save' && profileData) {
      const { _id, ...dataToUpdate } = profileData; 
      
      const updateRes = await profileCollection.where({_openid: openid}).update({
          data: {...dataToUpdate, updateTime: new Date()}
      })
      
      if (updateRes.stats.updated === 0) {
          await profileCollection.add({
              data: {...dataToUpdate, _openid: openid, createTime: new Date()}
          })
      }
      return { code: 200, msg: '资料更新成功' }
      
    } else {
      return { code: 400, msg: '无效的动作或缺少资料' }
    }
  } catch (err) {
    console.error('更新/获取资料失败', err)
    return { code: 500, msg: '资料操作失败', error: err }
  }
}
