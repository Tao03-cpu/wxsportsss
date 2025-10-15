// index.js
Page({
    data: {
      currentTab: 'recommend' // 默认选中“推荐”
    },
  
    // 点击导航时触发
    changeTab(e) {
      // e.currentTarget.dataset.tab 获取到 data-tab 的值
      this.setData({
        currentTab: e.currentTarget.dataset.tab // 更新当前选中项
      })
    }
  })