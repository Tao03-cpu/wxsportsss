// pages/sports/sports.js
const EARTH_RADIUS = 6371000; // 米

Page({
  data: {
    modes: [
      { type: 'run', label: '跑步', icon: 'music' },
      { type: 'ride', label: '骑行', icon: 'location' },
      { type: 'gym', label: '健身', icon: 'people' },
      { type: 'yoga', label: '瑜伽', icon: 'tag' },
      { type: 'custom', label: '自定义', icon: 'star' } // 自定义模式
    ],
    currentMode: 'run',

    // 自定义模式字段
    showCustomInput: false,
    customInput: '',
    customShowMap: false,

    // map & track
    latitude: 0,
    longitude: 0,
    mapScale: 16,
    polyline: [],
    trackPoints: [],
    totalDistance: 0, // 米

    // timer
    status: 'idle', // idle / running / paused
    startTime: 0,
    elapsedAcc: 0, // 秒
    timerId: null,
    durationStr: '00:00:00',
    distanceStr: '0.00 km',
    paceStr: '--',

    // today records
    todayRecords: [],

    // UI
    toast: '',
    showMap: false,
    // check-in state
    todayCheckinDone: false,
    // goals
    goals: { dailyMin: 30, weeklyMin: 150, dailyDistanceKm: 5 },
    goalMsg: ''
  },

  onLoad() {
    this.initLocation();
    this.loadGoals();
    this.loadTodayRecords();
    this.checkTodayCloud();
  },

  //模式切换
  onModeSelect(e) {
    const type = e.currentTarget.dataset.type;
    if (this.data.currentMode === type) return;
    if (this.data.status === 'running') {
      this.showToast('正在记录中，先结束本次运动再切换模式。');
      return;
    }

    if (type === 'custom') {
      this.setData({
        showCustomInput: true,
        customInput: '',
        currentMode: 'custom'
      });
    } else {
      const showMap = (type === 'run' || type === 'ride');
      this.setData({
        currentMode: type,
        showMap,
        showCustomInput: false
      });
    }
  },

  //自定义输入
  onCustomInput(e) {
    this.setData({ customInput: e.detail.value });
  },

  confirmCustomMode() {
    if (!this.data.customInput.trim()) {
      this.showToast('请输入运动类型');
      return;
    }

    wx.showModal({
      title: '显示地图',
      content: '是否在此运动模式下显示地图轨迹？',
      confirmText: '是',
      cancelText: '否',
      success: (res) => {
        this.setData({
          showMap: res.confirm,
          showCustomInput: false
        });
        this.showToast('已切换到自定义运动');
      }
    });
  },

  // 定位初始化 & 权限
  initLocation() {
    const self = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        self.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          showMap: (self.data.currentMode === 'run' || self.data.currentMode === 'ride')
        });
      },
      fail() {
        self.setData({ toast: '无法获取当前位置，请打开定位权限', showMap: false });
      }
    });
  },

  // 计时器控制
  onStart() {
    this.setData({
      trackPoints: [],
      totalDistance: 0,
      polyline: [],
      distanceStr: '0.00 km',
      paceStr: '--'
    });

    const now = Date.now();
    this.setData({
      startTime: now,
      status: 'running',
      elapsedAcc: 0
    });
    this.startTimer();

    if (this.shouldUseLocation()) {
      this.startLocationUpdates();
    }
  },

  onPause() {
    if (this.data.status !== 'running') return;
    clearInterval(this.data.timerId);
    const elapsedSec = Math.floor((Date.now() - this.data.startTime) / 1000);
    this.setData({
      elapsedAcc: this.data.elapsedAcc + elapsedSec,
      startTime: 0,
      status: 'paused',
      timerId: null
    });
    if (this.shouldUseLocation()) {
      wx.stopLocationUpdate && wx.stopLocationUpdate();
    }
  },

  onResume() {
    if (this.data.status !== 'paused') return;
    this.setData({
      startTime: Date.now(),
      status: 'running'
    });
    this.startTimer();
    if (this.shouldUseLocation()) {
      this.startLocationUpdates();
    }
  },

  onStop() {
    if (this.data.status === 'idle') return;

    if (this.data.timerId) clearInterval(this.data.timerId);
    let totalSec = this.data.elapsedAcc;
    if (this.data.status === 'running' && this.data.startTime) {
      totalSec += Math.floor((Date.now() - this.data.startTime) / 1000);
    }

    const record = {
      id: 'r_' + Date.now(),
      timestamp: Date.now(),
      mode: this.data.currentMode,
      modeLabel: this.data.currentMode === 'custom'
                 ? this.data.customInput || '自定义'
                 : this.data.modes.find(m => m.type === this.data.currentMode).label,
      duration: totalSec, // 秒
      distance: this.data.totalDistance, // 米
      track: this.data.trackPoints,
      time: new Date().toLocaleTimeString()
    };

    // 1. 本地保存记录
    this.saveRecord(record);

    // 发送数据到云端进行同步
    this.sendToCloud(record.duration, record.timestamp);

    if (this.shouldUseLocation()) {
      wx.stopLocationUpdate && wx.stopLocationUpdate();
    }

    this.setData({
      status: 'idle',
      startTime: 0,
      elapsedAcc: 0,
      timerId: null
    });

    this.showToast('已保存本次运动');
    this.loadTodayRecords(); // 刷新今日记录列表
    // 标记今日已打卡
    try { wx.setStorageSync('today_checkin_date', this.getDateStr(new Date())); } catch(_) {}
    this.setData({ todayCheckinDone: true });
  },

  // 发送运动数据到云函数
  sendToCloud(durationSeconds, recordTimetamp) {
    const dataToSend = {
      duration: Math.ceil(durationSeconds / 60), // 转换为分钟，向上取整
      steps:0,
      checkinDate:new Date(recordTimetamp).toISOString()
    };

    wx.cloud.callFunction({
      name: 'recordSportSession', // 调用云函数
      data: dataToSend,
      success: res => {
        if (res.result && res.result.code !== 200) {
          console.warn('云端记录失败:', res.result.msg);
        }
      },
      fail: err => {
        console.error('调用记录运动云函数失败', err);
      }
    });
  },
  
  
  showToast(message, duration = 2000) {
    this.setData({ toast: message });
    setTimeout(() => {
      this.setData({ toast: '' });
    }, duration);
  },
  startTimer() {
    const self = this;
    const tick = () => {
      let elapsed = 0;
      if (self.data.startTime) {
        elapsed = Math.floor((Date.now() - self.data.startTime) / 1000);
      }
      const total = self.data.elapsedAcc + elapsed;
      self.setData({
        durationStr: self.formatSeconds(total),
        distanceStr: (self.data.totalDistance / 1000).toFixed(2) + ' km',
        paceStr: self.computePaceStr(total, self.data.totalDistance)
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    this.setData({ timerId: id });
  },

  shouldUseLocation() {
    return this.data.currentMode === 'run' || this.data.currentMode === 'ride' || (this.data.currentMode === 'custom' && this.data.showMap);
  },

  startLocationUpdates() {
    const self = this;
    if (wx.startLocationUpdate) {
      wx.startLocationUpdate({
        success() {
          wx.onLocationChange(loc => {
            const point = { latitude: loc.latitude, longitude: loc.longitude, timestamp: Date.now() };
            self.processNewPoint(point);
          });
        },
        fail(err) {
          console.warn('startLocationUpdate fail', err);
          self.handleLocationPermissionFail();
        }
      });
    } else {
      this.locationInterval = setInterval(() => {
        wx.getLocation({
          type: 'gcj02',
          success(res) {
            const point = { latitude: res.latitude, longitude: res.longitude, timestamp: Date.now() };
            self.processNewPoint(point);
          },
          fail() { self.showToast('无法获取定位，请检查权限'); }
        });
      }, 3000);
    }
  },

  handleLocationPermissionFail() {
    const self = this;
    wx.showModal({
      title: '定位权限未开启',
      content: '需要允许定位权限以记录轨迹，是否前往设置？',
      confirmText: '去设置',
      cancelText: '取消',
      success(res) {
        if (res.confirm) {
          wx.openSetting({
            success(settingRes) {
              if (settingRes.authSetting && settingRes.authSetting['scope.userLocation']) {
                self.showToast('已开启定位，请重新开始运动');
              } else {
                self.showToast('尚未允许定位，无法记录轨迹');
              }
            }
          });
        }
      }
    });
  },

  processNewPoint(point) {
    // 校验坐标
    if (!isFinite(point.latitude) || !isFinite(point.longitude)) return;
    if (point.latitude > 90 || point.latitude < -90) return;
    if (point.longitude > 180 || point.longitude < -180) return;

    const pts = this.data.trackPoints.slice();
    if (pts.length === 0) {
      pts.push(point);
      this.setData({
        trackPoints: pts,
        latitude: point.latitude,
        longitude: point.longitude,
        polyline: []
      });
      return;
    }

    const prev = pts[pts.length - 1];
    const d = this.computeDistance(prev.latitude, prev.longitude, point.latitude, point.longitude);
    if (d < 1) {
      this.setData({ latitude: point.latitude, longitude: point.longitude });
      return;
    }

    pts.push(point);
    const newDistance = this.data.totalDistance + d;

    const pathPoints = pts.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
    const polylineArr = pathPoints.length >= 2 ? [{
      points: pathPoints,
      color: "#00AA44",
      width: 5,
      dottedLine: false
    }] : [];
    this.setData({
      trackPoints: pts,
      totalDistance: newDistance,
      latitude: point.latitude,
      longitude: point.longitude,
      polyline: polylineArr,
      distanceStr: (newDistance / 1000).toFixed(2) + ' km',
      paceStr: this.computePaceStr(this.getTotalSeconds(), newDistance)
    });
  },

  computeDistance(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
    const a = Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c;
  },

  getTotalSeconds() {
    let total = this.data.elapsedAcc;
    if (this.data.status === 'running' && this.data.startTime) {
      total += Math.floor((Date.now() - this.data.startTime) / 1000);
    }
    return total;
  },

  computePaceStr(totalSeconds, distanceMeters) {
    if (!distanceMeters || distanceMeters < 1) return '--';
    const km = distanceMeters / 1000;
    const secPerKm = totalSeconds / km;
    const m = Math.floor(secPerKm / 60);
    const s = Math.floor(secPerKm % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} /km`;
  },

  saveRecord(record) {
    const all = wx.getStorageSync('records') || [];
    all.push(record);
    wx.setStorageSync('records', all);
  },

  loadTodayRecords() {
    const all = wx.getStorageSync('records') || [];
    const todayKey = this.getDateStr(new Date());
    const today = all
      .filter(r => {
        const recDate = new Date(r.timestamp || Number((r.id || '').split('_')[1] || 0));
        return this.getDateStr(recDate) === todayKey;
      })
      .reverse()
      .map(r => ({
        ...r,
        durationStr: this.formatSeconds(r.duration || 0),
        distanceStr: ((r.distance || 0) / 1000).toFixed(2) + ' km',
        paceStr: this.computePaceStr(r.duration || 0, r.distance || 0)
      }));
    this.setData({ todayRecords: today });
    // 目标进度与激励
    const totalSec = today.reduce((acc, r) => acc + (r.duration || 0), 0);
    const totalKm = today.reduce((acc, r) => acc + ((r.distance || 0)/1000), 0);
    const msg = this.buildGoalMsg(totalSec, totalKm);
    this.setData({ goalMsg: msg });
  },

  getDateStr(d) {
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  },

  formatSeconds(sec) {
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':');
  },

  // --- Goals ---
  loadGoals() {
    try {
      const g = wx.getStorageSync('user_goals');
      if (g && typeof g === 'object') {
        this.setData({ goals: { ...this.data.goals, ...g } });
        // 重新计算当日激励文案，确保展示与设置一致
        const totalSec = (this.data.todayRecords || []).reduce((acc, r) => acc + (r.duration || 0), 0);
        const totalKm = (this.data.todayRecords || []).reduce((acc, r) => acc + ((r.distance || 0)/1000), 0);
        const msg = this.buildGoalMsg(totalSec, totalKm);
        this.setData({ goalMsg: msg });
      }
    } catch(_) {}
  },
  setGoals() {
    wx.showModal({ title: '每日目标(分钟)', editable: true, placeholderText: String(this.data.goals.dailyMin), success: (r) => {
      if (!r.confirm) return;
      const daily = Math.max(0, parseInt(r.content || this.data.goals.dailyMin));
      wx.showModal({ title: '每周目标(分钟)', editable: true, placeholderText: String(this.data.goals.weeklyMin), success: (r2) => {
        if (!r2.confirm) return;
        const weekly = Math.max(0, parseInt(r2.content || this.data.goals.weeklyMin));
        const goals = { ...this.data.goals, dailyMin: daily, weeklyMin: weekly };
        this.setData({ goals });
        try { wx.setStorageSync('user_goals', goals); } catch(_) {}
        const totalSec = (this.data.todayRecords || []).reduce((acc, r) => acc + (r.duration || 0), 0);
        const totalKm = (this.data.todayRecords || []).reduce((acc, r) => acc + ((r.distance || 0)/1000), 0);
        this.setData({ goalMsg: this.buildGoalMsg(totalSec, totalKm) });
        wx.showToast({ title: '目标已更新', icon: 'success' });
      }});
    }});
  },
  buildGoalMsg(totalSec, totalKm) {
    const min = Math.floor(totalSec/60);
    const dailyTarget = this.data.goals.dailyMin;
    if (min >= dailyTarget) return `今日达成目标 ${min}min，继续保持！`;
    const remain = Math.max(0, dailyTarget - min);
    if (remain <= 5) return `只差 ${remain}min 就完成今日目标！`;
    return `今日已运动 ${min}min，目标 ${dailyTarget}min。加油！`;
  },

  // --- Reminder on show ---
  onShow() {
    const key = this.getDateStr(new Date());
    const localDate = wx.getStorageSync('today_checkin_date');
    const done = localDate === key;
    this.setData({ todayCheckinDone: !!done });
    const remindersOn = !!wx.getStorageSync('remindersOn');
    if (remindersOn && !done) {
      wx.showModal({ title: '打卡提醒', content: '今天还没打卡，来一组运动吗？', confirmText: '开始运动' });
    }
  },

  // --- Cloud check fallback ---
  checkTodayCloud() {
    const db = wx.cloud.database();
    const _ = db.command;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    db.collection('checkin_records').where({ date: _.gte(start).and(_.lt(end)) }).count()
      .then(res => { this.setData({ todayCheckinDone: res.total > 0 }); })
      .catch(() => { wx.cloud.callFunction({ name: 'dbInit', data: { collection: 'checkin_records' } }); });
  },

  showToast(msg, dur=1500) {
    this.setData({ toast: msg });
    setTimeout(() => this.setData({ toast: '' }), dur);
  },

  onUnload() {
    if (this.data.timerId) clearInterval(this.data.timerId);
    if (this.locationInterval) clearInterval(this.locationInterval);
    if (wx.stopLocationUpdate) {
      try { wx.stopLocationUpdate(); } catch(e) {}
    }
  }
});
