const app = getApp()

/* 页面：授权（auth）；用于登录或用户授权相关操作 */
Page({
  
  // 核心处理函数：用户点击授权按钮后触发
  handleGetUserInfo: function(e) {
    if (e.detail.userInfo) {
      // 用户同意授权，获取到资料
      const userInfo = e.detail.userInfo
      this.updateProfile(userInfo)
    } else {
      // 用户拒绝授权，仍然使用默认资料进入
      wx.showToast({ title: '已取消授权，使用默认昵称', icon: 'none' })
      this.finalRoute()
    }
  },

  // 1. 调用云函数将用户资料更新到云数据库（统一使用 updateProfile）
  updateProfile: function(userInfo) {
    wx.showLoading({ title: '正在更新资料...', mask: true })

    // 确保全局 userInfo 对象存在
    if (!app.globalData.userInfo) {
      app.globalData.userInfo = {}
    }

    // 先获取一次已存在的资料，避免每次授权都把手动修改过的昵称覆盖回“微信用户”
    wx.cloud.callFunction({
      name: 'updateProfile',
      data: { action: 'fetch' }
    }).then(res => {
      const profile = (res.result && (res.result.profile || res.result.data)) || {}

      const profileData = {}

      // 1）昵称：只有在“还没有昵称”或是默认占位值时，才用微信昵称去填充
      const currentNickname = profile.nickname
      const isDefaultNickname =
        !currentNickname ||
        currentNickname === '运动达人' ||
        currentNickname === '微信用户'

      if (isDefaultNickname && userInfo.nickName) {
        profileData.nickname = userInfo.nickName
      }

      // 2）头像：只有当当前资料里还没有头像时，才使用微信头像补一次
      const currentAvatar = profile.avatarUrl
      const hasCustomAvatar = !!currentAvatar
      if (!hasCustomAvatar && userInfo.avatarUrl) {
        profileData.avatarUrl = userInfo.avatarUrl
      }

      // 如果既不需要改昵称也不需要改头像，就直接跳过保存
      if (Object.keys(profileData).length === 0) {
        // 仍然更新一下全局变量，保证前端显示同步
        app.globalData.userInfo.nickname = profile.nickname || userInfo.nickName
        app.globalData.userInfo.avatarUrl = profile.avatarUrl || userInfo.avatarUrl

        wx.hideLoading()
        this.finalRoute()
        return
      }

      // 有需要更新的字段，再真正调用 save
      return wx.cloud.callFunction({
        name: 'updateProfile',
        data: {
          action: 'save',
          profileData
        }
      }).then(() => {
        app.globalData.userInfo.nickname = profileData.nickname || currentNickname
        app.globalData.userInfo.avatarUrl = profileData.avatarUrl || profile.avatarUrl

        wx.hideLoading()
        this.finalRoute()
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('更新资料失败', err)
      wx.showToast({ title: '资料更新失败，使用默认信息', icon: 'none' })
      this.finalRoute()
    })
  },

  // 2. 最终的路由分发：根据角色跳转到 index 或 admin
  finalRoute: function() {
    wx.cloud.callFunction({
      name: 'updateProfile',
      data: { action: 'fetch' }
    }).then(res => {
      const profile = (res.result && (res.result.profile || res.result.data)) || {};
      const role = profile.role || (app.globalData.userInfo && app.globalData.userInfo.role) || 'user';
      if (role === 'admin') {
        wx.reLaunch({ url: '/pages/admin/admin' })
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    }).catch(() => {
      const role = (app.globalData.userInfo && app.globalData.userInfo.role) || 'user';
      if (role === 'admin') {
        wx.reLaunch({ url: '/pages/admin/admin' })
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    })
  }
})
