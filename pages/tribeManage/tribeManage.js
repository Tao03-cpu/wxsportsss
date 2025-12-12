// pages/tribeManage/tribeManage.js
const app = getApp();

Page({
  data: {
    tribes: [],
    isLoading: true
  },

  onLoad() {
    this.fetchTribes();
  },

  onPullDownRefresh() {
    this.fetchTribes(() => {
      wx.stopPullDownRefresh();
    });
  },

  fetchTribes(cb) {
    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'tribeFunctions',
      data: { action: 'listTribes' }
    }).then(res => {
      if (res.result && res.result.code === 200) {
        this.setData({ tribes: res.result.data });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    }).finally(() => {
      this.setData({ isLoading: false });
      if (cb) cb();
    });
  },

  // 临时管理功能：清空聊天记录
  clearAllMessages() {
    wx.showModal({
      title: '高危操作',
      content: '确定要清空所有部落的聊天记录吗？此操作不可恢复！',
      confirmColor: '#FF0000',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在清空...' });
          wx.cloud.callFunction({
            name: 'tribeFunctions',
            data: { action: 'clearTribeMessages' }
          }).then(res => {
            wx.hideLoading();
            console.log('清理结果:', res); // 调试日志

            if (res.result && res.result.code === 200) {
              wx.showModal({
                title: '清理完成',
                content: `成功删除了 ${res.result.stats.removed} 条消息 (云函数版本: ${res.result.version || '旧版'})`,
                showCancel: false
              });
            } else {
              // 失败时，弹窗显示详细错误信息
              wx.showModal({
                title: '清理失败',
                content: JSON.stringify(res.result || res),
                showCancel: false
              });
            }
          }).catch(err => {
            wx.hideLoading();
            console.error('调用异常详情:', err);
            // 异常时，弹窗显示详细错误信息
            wx.showModal({
              title: '调用异常',
              content: err.toString() + '\n' + JSON.stringify(err),
              showCancel: false
            });
          });
        }
      }
    });
  },

  onJoinTribe(e) {
    const tribeId = e.currentTarget.dataset.id;
    if (!tribeId) return;

    wx.showLoading({ title: '加入中...' });
    wx.cloud.callFunction({
      name: 'joinTribe',
      data: { tribeId: tribeId }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 200) {
        wx.showToast({ title: '加入成功', icon: 'success' });
        // 刷新列表（如果需要更新状态，这里可以优化）
      } else {
        wx.showToast({ title: res.result.msg || '加入失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '操作异常', icon: 'none' });
    });
  }
});
