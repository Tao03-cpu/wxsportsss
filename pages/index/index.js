Page({
  data: {
    bannerList: [],
    sportList: [],
    techniqueList: []
  },

  onLoad() {
    this.fetchIndexData()
  },

  onPullDownRefresh() {
    this.fetchIndexData(() => {
      wx.stopPullDownRefresh()
    })
  },

  fetchIndexData(callback) {
    wx.cloud.callFunction({
      name: 'getIndexData'
    }).then(res => {
      console.log("云函数返回：", res);
      const result = res.result || {};
      this.setData({
        bannerList: result.bannerList || [],
        sportList: result.sportList || [],
        techniqueList: (result.techniqueList || []).map(item => ({
          ...item,
          iconUrl: "/assets/tips-icon.png"
        }))
      })
      callback && callback()
    }).catch(err => {
      console.error("云函数错误：", err);
      callback && callback()
    })
  }
})