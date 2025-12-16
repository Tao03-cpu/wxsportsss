// pages/mine/mine.js
const CLOUD_DEFAULT_AVATAR_ID = 'cloud://cloud1-3g5evs3cb978a9b3.636c-cloud1-3g5evs3cb978a9b3-1382768121/avatar/default avatar.jpg'; 

Page({
  data: {
    // 完整的 userInfo 结构，包含所有默认值
    userInfo: { 
        _id: '', // 用户唯一ID
        nickname: '加载中...', 
        level: 'L0', 
        tribe_tags: ['新人', '运动小白'], 
        is_joined: false, 
        avatarUrl: CLOUD_DEFAULT_AVATAR_ID, 
        // 统计数据结构，用于 WXML 绑定 (燃动数据)
        stats: { 
            today_steps: 0,
            week_duration: 0, // 分钟
            total_checkins: 0,
        }
    },
    calendarDays: [], // 日历数组 (一维数组)
    calendarTitle: '', // 日历月份标题
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    profileRequesting: false,
    lastProfileTime: 0,
    goals: { weeklyMin: 150 },
    goalMsg: '',
    todayCheckinDone: false,
  },

  onLoad: function () {
    this.loadUserProfile(); 
    this.getAndDisplayStats(); 
    this.loadGoals();
  },

  onShow: function() {
    this.loadUserProfile();
    this.getAndDisplayStats();
    this.loadGoals();
    const remindersOn = !!wx.getStorageSync('remindersOn');
    if (remindersOn && !this.data.todayCheckinDone) {
      wx.showToast({ title: '今天还没打卡，来运动一下吧', icon: 'none' });
    }
  },
  // 加载或创建用户资料
  async loadUserProfile() {
    try {
      const res = await wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'fetch' } });
      const profile = (res.result && (res.result.profile || res.result.data)) || {};
      const stats = profile.stats || this.data.userInfo.stats;
      this.setData({
        userInfo: {
          ...this.data.userInfo,
          ...profile,
          stats: stats,
          avatarUrl: profile.avatarUrl || CLOUD_DEFAULT_AVATAR_ID
        }
      });
    } catch (e) {
      wx.showToast({ title: '加载资料失败', icon: 'none' });
    }
  },

  // 用户点击编辑资料/获取头像昵称
  editProfile() {
    const now = Date.now();
    if (this.data.profileRequesting || (now - this.data.lastProfileTime) < 2000) {
      wx.showToast({ title: '操作过于频繁', icon: 'none' });
      return;
    }
    this.setData({ profileRequesting: true });
    wx.getUserProfile({
        desc: '用于完善会员资料',
        success: (res) => {
            const { nickName, avatarUrl } = res.userInfo;
            this.updateUserProfile({ 
                nickname: nickName, 
                avatarUrl: avatarUrl 
            });
            this.setData({ lastProfileTime: Date.now(), profileRequesting: false });
        },
        fail: (err) => {
            console.error('获取用户资料失败', err);
            wx.showToast({ title: '授权失败', icon: 'none' });
            this.setData({ profileRequesting: false });
        }
    });
  },

  // 更新资料到云数据库
  async updateUserProfile(fields) {
    try {
      await wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: fields } });
      this.setData({ userInfo: { ...this.data.userInfo, ...fields } });
      wx.showToast({ title: '资料更新成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 直接在“我的”页面更换头像并自动保存
  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        const cloudPath = `user_avatars/${Date.now()}_${Math.floor(Math.random()*1000)}.png`;
        wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
          .then(uploadRes => {
            const fileID = uploadRes.fileID;
            // 写入云数据库
            return wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: { avatarUrl: fileID } } })
              .then(() => {
                this.setData({ 'userInfo.avatarUrl': fileID });
                wx.hideLoading();
                wx.showToast({ title: '头像已更新', icon: 'success' });
              });
          })
          .catch(err => { wx.hideLoading(); console.error('上传头像失败', err); wx.showToast({ title: '上传失败', icon: 'none' }); });
      }
    });
  },

  // 调用云函数获取统计和日历数据
  getAndDisplayStats: function() {
    const { currentYear, currentMonth } = this.data;
    const monthTitle = `${currentYear}年${currentMonth}月`;

    // 调用云函数 getCheckinData 
    wx.cloud.callFunction({
        name: 'getCheckinData', 
        data: {
            year: currentYear,
            month: currentMonth
        },
        success: (res) => {
            if (res.result && res.result.code === 0) {
                const { weeklyDuration, totalCheckins, checkedInDates } = res.result.data;

                // 生成日历
                const calendarDays = this.generateFullCalendar(currentYear, currentMonth, checkedInDates);

                const today = new Date().getDate();
                const todayDone = checkedInDates.includes(today);
                this.setData({
                    'userInfo.stats.week_duration': weeklyDuration,
                    'userInfo.stats.total_checkins': totalCheckins,
                    calendarDays: calendarDays,
                    calendarTitle: monthTitle,
                    todayCheckinDone: todayDone
                });

                // 目标激励（周目标）
                const msg = this.buildWeeklyGoalMsg(weeklyDuration);
                this.setData({ goalMsg: msg });

                // 等级与标签自动升级
                const lvl = this.computeLevelFromCheckins(totalCheckins);
                const tags = this.computeTagsFromCheckins(totalCheckins);
                const needUpdate = (lvl !== this.data.userInfo.level) || JSON.stringify(tags) !== JSON.stringify(this.data.userInfo.tribe_tags || []);
                if (needUpdate) {
                  this.setData({ 'userInfo.level': lvl, 'userInfo.tribe_tags': tags });
                  wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: { level: lvl, tribe_tags: tags } } });
                }
            } else {
                console.error('云函数返回错误:', res.result.msg);
                // wx.showToast({ title: '统计数据加载失败', icon: 'none' });
            }
        },
        fail: (err) => {
            console.error('调用云函数 getCheckinData 失败:', err);
            // wx.showToast({ title: '统计数据加载失败，请检查云函数', icon: 'none' });
        }
    });
  },

  // 目标管理
  loadGoals() {
    try {
      const g = wx.getStorageSync('user_goals');
      if (g && typeof g === 'object') this.setData({ goals: { ...this.data.goals, ...g } });
    } catch(_) {}
  },
  setGoals() {
    wx.showModal({ title: '每周目标(分钟)', editable: true, placeholderText: String(this.data.goals.weeklyMin), success: (r) => {
      if (!r.confirm) return;
      const weekly = Math.max(0, parseInt(r.content || this.data.goals.weeklyMin));
      const goals = { ...this.data.goals, weeklyMin: weekly };
      this.setData({ goals });
      try { wx.setStorageSync('user_goals', goals); } catch(_) {}
      wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: { goals } } });
      wx.showToast({ title: '目标已更新', icon: 'success' });
    }});
  },
  buildWeeklyGoalMsg(weekMin) {
    const target = this.data.goals.weeklyMin;
    if (weekMin >= target) return `本周达成 ${weekMin}min，继续挑战吧！`;
    const remain = Math.max(0, target - weekMin);
    if (remain <= 20) return `离本周目标只差 ${remain}min！`;
    return `本周已运动 ${weekMin}min，目标 ${target}min，加油！`;
  },

  setWeight() {
    wx.showModal({ title: '输入体重(kg)', editable: true, placeholderText: String(this.data.userInfo.weight || ''), success: (r) => {
      if (!r.confirm) return;
      const v = parseFloat(r.content || '0');
      if (!(v > 0)) { wx.showToast({ title: '请输入有效体重', icon: 'none' }); return; }
      wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: { weight: v } } })
        .then(() => { this.setData({ 'userInfo.weight': v }); wx.showToast({ title: '已记录', icon: 'success' }); });
    }});
  },

  // 根据累计打卡天数计算等级
  computeLevelFromCheckins(total) {
    if (total >= 100) return 'L5';
    if (total >= 60) return 'L4';
    if (total >= 30) return 'L3';
    if (total >= 15) return 'L2';
    if (total >= 5) return 'L1';
    return 'L0';
  },

  // 根据累计打卡天数设置标签
  computeTagsFromCheckins(total) {
    if (total >= 100) return ['传奇', '榜样'];
    if (total >= 60) return ['精英', '稳健'];
    if (total >= 30) return ['达人', '耐力'];
    if (total >= 15) return ['进阶', '活力'];
    if (total >= 5) return ['起步', '坚持'];
    return ['新人', '运动小白'];
  },
  
  /**
   * 辅助函数：生成日历数组（用于前端渲染）
   */
  generateFullCalendar: function(year, month, checkedDates) {
    const days = [];
    const date = new Date(year, month - 1, 1);
    const firstDayOfWeek = date.getDay(); // 本月1号是周几 (0:周日, 1:周一...)
    const lastDayOfMonth = new Date(year, month, 0).getDate(); // 当月天数

    // 1. 填充空白日期（日历对齐）
    for (let i = 0; i < firstDayOfWeek; i++) {
        days.push({ day: null, is_checked: false, is_empty: true });
    }

    // 2. 填充当月日期
    for (let i = 1; i <= lastDayOfMonth; i++) {
        days.push({ 
            day: i, 
            is_checked: checkedDates.includes(i),
            is_empty: false
        });
    }
    
    return days;
  },

  // -------------------------
  // 导航
  // -------------------------

  goToFeedback() {
    // 假设跳转到 feedback 页面，该页面将使用 'feedback' 集合
    wx.navigateTo({
        url: '/pages/feedback/feedback' 
    });
  },

  goToSettings() {
    // 假设跳转到设置页面
    wx.navigateTo({
        url: '/pages/settings/settings' 
    });
  }
  ,
  goHealthDashboard() { wx.navigateTo({ url: '/pages/healthDashboard/healthDashboard' }); }
  ,
  // goToAdmin() { wx.navigateTo({ url: '/pages/admin/admin' }); }
  // ,
  // becomeAdmin() {
  //   wx.showLoading({ title: '切换中...' });
  //   wx.cloud.callFunction({
  //     name: 'updateProfile',
  //     data: { action: 'save', profileData: { role: 'admin' } }
  //   }).then(() => {
  //     wx.hideLoading();
  //     wx.showToast({ title: '已设为管理员', icon: 'success' });
  //     wx.reLaunch({ url: '/pages/admin/admin' });
  //   }).catch(() => {
  //     wx.hideLoading();
  //     wx.showToast({ title: '失败，请重试', icon: 'none' });
  //   });
  // }
});
