/*
  页面：设置（settings）
  作用：通用设置、资料编辑入口、目标设置入口、健康档案入口、打卡提醒开关与时间。
  说明：订阅消息需替换模板 ID，并部署云函数 reminderFunctions；提醒状态同时写入本地与云端。
*/
Page({
  data: {
    remindersOn: true,
    reminderTime: '20:00',
    cacheSize: '0 KB'
  },

  onLoad() {
    this.getCacheSize();
    try {
      const on = wx.getStorageSync('remindersOn');
      const t = wx.getStorageSync('reminderTime');
      this.setData({ remindersOn: on === '' ? true : !!on, reminderTime: t || '20:00' });
    } catch(_) {}
  },

  onShow() {
      // 确保在返回时刷新缓存大小
      this.getCacheSize();
  },

  getCacheSize() {
    try {
      const info = wx.getStorageInfoSync();
      const sizeInKB = info.currentSize;
      let sizeStr = (sizeInKB < 1024) ? `${sizeInKB} KB` : `${(sizeInKB / 1024).toFixed(2)} MB`;
      this.setData({ cacheSize: sizeStr });
    } catch (e) {
      this.setData({ cacheSize: '获取失败' });
    }
  },

  clearCache() {
    wx.showModal({
      title: '确认清理',
      content: '清理缓存将删除本地存储数据（不影响云端资料），是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清理中...' });
          try {
            wx.clearStorageSync(); 
            setTimeout(() => {
              wx.hideLoading();
              this.getCacheSize(); 
              wx.showToast({ title: '清理完成', icon: 'success' });
            }, 500);
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '清理失败', icon: 'error' });
          }
        }
      }
    });
  },
  
  onReminderChange(e) {
    const val = e.detail.value;
    this.setData({ remindersOn: val });
    try { wx.setStorageSync('remindersOn', val); } catch(_) {}
    wx.showToast({ title: val ? '提醒已开启' : '提醒已关闭', icon: 'none' });
    wx.cloud.callFunction({ name: 'reminderFunctions', data: { action: 'saveReminderSettings', remindersOn: val, reminderTime: this.data.reminderTime } });
  },

  onReminderTimeChange(e) {
    const val = e.detail.value;
    this.setData({ reminderTime: val });
    try { wx.setStorageSync('reminderTime', val); } catch(_) {}
    wx.cloud.callFunction({ name: 'reminderFunctions', data: { action: 'saveReminderSettings', remindersOn: this.data.remindersOn, reminderTime: val } });
  },

  subscribeNotify() {
    const TEMPLATE_ID = '请替换为你的模板ID';
    wx.requestSubscribeMessage({ tmplIds: [TEMPLATE_ID], success: (res) => {
      if (res[TEMPLATE_ID] === 'accept') {
        wx.showToast({ title: '订阅成功', icon: 'success' });
        wx.cloud.callFunction({ name: 'reminderFunctions', data: { action: 'saveReminderSettings', remindersOn: true, reminderTime: this.data.reminderTime } });
      } else {
        wx.showToast({ title: '订阅未授权', icon: 'none' });
      }
    } });
  },
  
  goToChangePassword() {
    wx.showToast({ title: '跳转到修改密码页 (待开发)', icon: 'none' });
  },

  goToPrivacy() {
    wx.showToast({ title: '跳转到隐私设置页 (待开发)', icon: 'none' });
  },
  
  goToAbout() {
    wx.showToast({ title: '跳转到关于我们页 (待开发)', icon: 'none' });
  },

  goEditProfile() {
    wx.navigateTo({ url: '/pages/editProfile/editProfile' });
  },

  goGoalSettings() { wx.navigateTo({ url: '/pages/goalSettings/goalSettings' }); },
  goHealthDashboard() { wx.navigateTo({ url: '/pages/healthDashboard/healthDashboard' }); },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 实际应用中：清除用户登录态 (如 token)，并重定向到登录页
          wx.showToast({ title: '退出成功', icon: 'success' });
        }
      }
    });
  }
});
