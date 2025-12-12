const app = getApp()

/* 页面：管理后台（admin）；用于管理数据或配置 */
Page({
  data: {
    userInfo: {}
  },
  onLoad: function () {
    this.setData({ userInfo: app.globalData.userInfo })
  },
  logout: function() {
    // 退出管理员模式，返回到 loading 页重新进行身份校验和跳转
    wx.reLaunch({ url: '/pages/index/index' }) 
  }
})
