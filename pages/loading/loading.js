const app = getApp()

/* 页面：加载（loading）；用于启动阶段的引导或资源预加载 */
Page({
  data: {
    tipText: '正在连接燃动部落...' // 添加一个状态文本
  },
  
  onLoad: function () {
    this.checkIdentity()
  },

  checkIdentity: function () {
    wx.showNavigationBarLoading() // 导航栏显示加载动画
    this.setData({ tipText: '正在校验您的身份...' })
    
    // 调用云函数登录
    wx.cloud.callFunction({
      name: 'userLogin',
      success: res => {
        wx.hideNavigationBarLoading()
        const userData = res.result.data
        
        // 存入全局
        app.globalData.userInfo = userData
        
        // 🚨 关键修改：登录成功后，跳转到授权页获取用户资料
        wx.reLaunch({ url: '/pages/auth/auth' }) 
      },
      fail: err => {
        wx.hideNavigationBarLoading()
        this.setData({ tipText: '系统连接错误，请重试' })
        console.error('登录失败', err)
        wx.showToast({ title: '系统连接错误', icon: 'none' })
      }
    })
  }
})
