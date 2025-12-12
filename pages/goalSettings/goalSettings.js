/*
  页面：目标设置（goalSettings）
  作用：编辑每日/每周运动目标，保存到本地与云端 user_profiles.goals。
*/
Page({
  data: { goals: { dailyMin: 30, weeklyMin: 150 } },
  onLoad() {
    this.loadGoals();
  },
  loadGoals() {
    wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'fetch' } })
      .then(res => {
        const p = (res.result && (res.result.profile || res.result.data)) || {};
        const g = p.goals || wx.getStorageSync('user_goals') || this.data.goals;
        this.setData({ goals: g });
      }).catch(() => {
        const g = wx.getStorageSync('user_goals') || this.data.goals;
        this.setData({ goals: g });
      });
  },
  onDailyInput(e) { this.setData({ 'goals.dailyMin': parseInt(e.detail.value || 0) }); },
  onWeeklyInput(e) { this.setData({ 'goals.weeklyMin': parseInt(e.detail.value || 0) }); },
  saveGoals() {
    const goals = this.data.goals;
    try { wx.setStorageSync('user_goals', goals); } catch(_) {}
    wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: { goals } } })
      .then(() => { wx.showToast({ title: '已保存', icon: 'success' }); })
      .catch(() => { wx.showToast({ title: '保存失败', icon: 'none' }); });
  }
})
