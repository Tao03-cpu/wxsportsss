Page({
  //定义页面初始数据
  data: {
    bannerList: [],
    sportList: [],
    techniqueList: []
  },
//调用自定义方法fetchIndexData，用来获取，设置首页所需的数据
  onLoad() {
    this.fetchIndexData()
  },
//下拉刷新
  onPullDownRefresh() {
    this.fetchIndexData(() => {
      wx.stopPullDownRefresh()
    })
  },
// fetchIndexData 是自定义方法，统一获取首页数据，并更新到 data 中
  // callback 是一个可选的回调函数
  fetchIndexData(callback) {
    //调用云函数
    wx.cloud.callFunction({
      name: 'getIndexData'
    }).then(res => {
      console.log("云函数返回：", res);
      //如果result不存在，返回空防止报错
      const result = res.result || {};
      //使用 setData 更新页面数据
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