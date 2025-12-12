// app.js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-3g5evs3cb978a9b3', 
        traceUser: true, // 追踪用户，方便日志分析
      });
    }

   
  },

  globalData: {
    userInfo: null
  }
});