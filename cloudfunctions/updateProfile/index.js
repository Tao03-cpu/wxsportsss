// cloudfunctions/updateProfile/index.js
//更新资料
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const { action, profileData } = event

  const profileCollection = db.collection('user_profiles')
  
  try {
    if (action === 'fetch') {
      const res = await profileCollection.where({_openid: openid}).limit(1).get()
      
      const defaultProfile = {
        avatarUrl: '', 
        nickname: '运动达人',
        genderIndex: 0,
        signature: '我的运动，我做主！',
        role: 'user'
      }
      
      if (res.data.length > 0) {
          const p = res.data[0]
          if (!p.role) {
            try { await profileCollection.where({ _openid: openid }).update({ data: { role: 'user', updateTime: new Date() } }) } catch(_) {}
            p.role = 'user'
          }
          return { code: 200, profile: p }
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
