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

  // 1. 调用云函数将用户资料更新到云数据库
  updateProfile: function(userInfo) {
    wx.showLoading({ title: '正在更新资料...', mask: true })
    
    wx.cloud.callFunction({
      name: 'updateUserInfo', // 调用第一步创建的云函数
      data: {
        userInfo: userInfo
      },
      success: res => {
        // 更新全局数据，让下一页面显示新资料
        app.globalData.userInfo.nickname = userInfo.nickName
        app.globalData.userInfo.avatarUrl = userInfo.avatarUrl
        
        wx.hideLoading()
        this.finalRoute() // 资料更新成功后，进行路由跳转
      },
      fail: err => {
        wx.hideLoading()
        console.error('更新资料失败', err)
        wx.showToast({ title: '资料更新失败，使用默认信息', icon: 'none' })
        this.finalRoute() // 失败也要继续跳转，不能卡死
      }
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
