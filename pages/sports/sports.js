Page({
    data: {
      sports: ['户外跑步', '户外行走', '骑行', '瑜伽'],
      currentSport: '户外跑步',
      latitude: 0,
      longitude: 0,
      polyline: [],
      isRunning: false,
      path: [],
      timer: null,
      timeDisplay: "00:00:00",
      seconds: 0,
      distance: 0,
      pace: "0'00\""
    },
  
    onLoad() {
      this.getLocation();
    },
  
    changeSport(e) {
      this.setData({
        currentSport: e.currentTarget.dataset.sport
      });
    },
  
    getLocation() {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.setData({
            latitude: res.latitude,
            longitude: res.longitude
          });
        }
      });
    },
  
    startRun() {
      wx.showToast({ title: '开始运动', icon: 'success' });
      this.setData({ isRunning: true, path: [], distance: 0, seconds: 0 });
      this.startTimer();
      this.watchPosition();
    },
  
    startTimer() {
      this.data.timer = setInterval(() => {
        let seconds = this.data.seconds + 1;
        const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        this.setData({
          seconds,
          timeDisplay: `${h}:${m}:${s}`
        });
      }, 1000);
    },
  
    watchPosition() {
      const that = this;
      this.locationChangeFn = wx.onLocationChange((res) => {
        const newPoint = { latitude: res.latitude, longitude: res.longitude };
        const updatedPath = [...that.data.path, newPoint];
        let newDistance = that.data.distance;
        if (that.data.path.length > 0) {
          newDistance += that.getDistance(
            that.data.path[that.data.path.length - 1],
            newPoint
          );
        }
        const pace = that.calculatePace(newDistance, that.data.seconds);
        that.setData({
          path: updatedPath,
          distance: newDistance.toFixed(2),
          polyline: [{ points: updatedPath, color: '#00B26A', width: 5 }],
          latitude: res.latitude,
          longitude: res.longitude,
          pace
        });
      });
      wx.startLocationUpdate({ success: () => console.log("位置监听开启") });
    },
  
    getDistance(p1, p2) {
      const R = 6371;
      const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
      const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
      const lat1 = (p1.latitude * Math.PI) / 180;
      const lat2 = (p2.latitude * Math.PI) / 180;
  
      const a = Math.sin(dLat / 2) ** 2 +
        Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // 返回公里
    },
  
    calculatePace(distance, seconds) {
      if (distance <= 0) return "0'00\"";
      const paceSec = seconds / distance;
      const min = Math.floor(paceSec / 60);
      const sec = Math.floor(paceSec % 60);
      return `${min}'${String(sec).padStart(2, '0')}"`;
    },
  
    endRun() {
      clearInterval(this.data.timer);
      wx.offLocationChange(this.locationChangeFn);
      this.setData({ isRunning: false });
  
      wx.showModal({
        title: '结束运动',
        content: `总时长：${this.data.timeDisplay}\n距离：${this.data.distance} km\n配速：${this.data.pace}`,
        confirmText: "保存记录",
        success: (res) => {
          if (res.confirm) {
            this.saveRunData();
          }
        }
      });
    },
  
    saveRunData() {
      const db = wx.cloud.database();
      db.collection('runRecords').add({
        data: {
          sport: this.data.currentSport,
          time: this.data.timeDisplay,
          distance: this.data.distance,
          pace: this.data.pace,
          date: new Date()
        },
        success: () => {
          wx.showToast({ title: '保存成功', icon: 'success' });
        }
      });
    },
  
    onUnload() {
      clearInterval(this.data.timer);
      wx.offLocationChange(this.locationChangeFn);
    }
  });
  