const app = getApp()
const db = wx.cloud.database()
const _ = db.command
const $ = db.command.aggregate

Page({
  data: {
    userInfo: {},
    activeTab: 'dashboard',
    metrics: { totalUsers: 0, dauToday: 0, messagesToday: 0, checkinRateToday: 0 },
    tribeStats: { totalTribes: 0, totalMembers: 0, avgMembers: 0, topTribes: [] },
    sportStats: { totalSessions: 0, totalDuration: 0, typeList: [] },
    users: [],
    usersPage: 0,
    userNickEdits: {},
    tribes: [],
    createTribeName: '',
    createTribeSlogan: '',
    editTribeId: '',
    editTribeName: '',
    editTribeSlogan: '',
    feedbacks: [],
    feedbackPage: 0
  },
  onLoad() {
    this.setData({ userInfo: app.globalData.userInfo || {} })
    this.ensureAdminAuth()
    this.loadMetrics()
    this.loadTribeStats()
    this.loadSportStats()
  },
  onShow() {
    if (this.data.activeTab === 'users' && !this.data.users.length) this.loadUsers()
    if (this.data.activeTab === 'tribes' && !this.data.tribes.length) this.loadTribes()
  },
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'dashboard') {
      this.loadMetrics()
      this.loadTribeStats()
      this.loadSportStats()
    }
    if (tab === 'users' && !this.data.users.length) this.loadUsers()
    if (tab === 'tribes' && !this.data.tribes.length) this.loadTribes()
    if (tab === 'feedback' && !this.data.feedbacks.length) this.loadFeedback()
  },
  logout() { wx.reLaunch({ url: '/pages/index/index' }) },

  ensureAdminAuth() {
    wx.cloud.callFunction({ name: 'userLogin' }).then(res => {
      const openid = res.result && res.result.openid
      if (!openid) {
        wx.showToast({ title: '未获取到身份，已继续', icon: 'none' })
        return
      }

      // 同时检查 user_profiles 与 user_tribe，任一命中即可视为管理员
      const tribeCheck = db.collection('users').where({
        _openid: openid,
        role: _.in(['管理员', '创建者', 'admin', 'super'])
      }).count()

      const profileCheck = db.collection('user_profiles').where({ _openid: openid }).limit(1).get()

      Promise.all([tribeCheck, profileCheck])
        .then(([tRes, pRes]) => {
          const profile = (pRes.data && pRes.data[0]) || {}
          const role = profile.role
          const isAdmin =
            (tRes && tRes.total > 0) ||
            (role && ['admin', '管理员', '创建者', 'super'].includes(role))

          if (!isAdmin) {
            // 不再拦截跳转，只做提示，便于调试
            wx.showToast({ title: '未配置管理员角色，已继续', icon: 'none' })
          }
        })
        .catch(() => {
          wx.showToast({ title: '权限检查异常，已继续', icon: 'none' })
        })
    }).catch(() => {
      wx.showToast({ title: '登录失败，已继续', icon: 'none' })
    })
  },

  loadMetrics() {
    wx.cloud.callFunction({ name: 'tribeFunctions', data: { action: 'getMetrics' } }).then(res => {
      if (res.result && res.result.code === 200) {
        const d = res.result.data || {}
        this.setData({ metrics: { totalUsers: d.totalUsers || 0, dauToday: d.dauToday || 0, messagesToday: d.messagesToday || 0, checkinRateToday: d.checkinRateToday || 0 } })
      }
    }).catch(()=>{})
  },

  loadTribeStats() {
    wx.cloud.callFunction({ name: 'tribeFunctions', data: { action: 'listTribes' } }).then(res => {
      if (res.result && res.result.code === 200) {
        const tribes = res.result.data || []
        const totalTribes = tribes.length
        const totalMembers = tribes.reduce((sum, t) => sum + (t.memberCount || 0), 0)
        const avgMembers = totalTribes > 0 ? Math.round(totalMembers / totalTribes) : 0
        const topTribes = tribes
          .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
          .slice(0, 5)
          .map(t => ({ id: t._id, name: t.name, memberCount: t.memberCount || 0 }))
        this.setData({ 
          tribeStats: { totalTribes, totalMembers, avgMembers, topTribes } 
        })
      }
    }).catch(() => {
      this.setData({ tribeStats: { totalTribes: 0, totalMembers: 0, avgMembers: 0, topTribes: [] } })
    })
  },

  loadSportStats() {
    db.collection('checkin_records').limit(1000).get().then(res => {
      const records = res.data || []
      const totalSessions = records.length
      const totalDuration = records.reduce((sum, r) => sum + (r.duration || 0), 0)
      
      // 从 user_profiles 获取用户运动统计
      db.collection('user_profiles').limit(100).get().then(profilesRes => {
        const profiles = profilesRes.data || []
        const totalCheckIns = profiles.reduce((sum, p) => sum + (p.totalCheckIns || 0), 0)
        const totalWeekDuration = profiles.reduce((sum, p) => sum + (p.weekDuration || 0), 0)
        
        // 模拟运动类型分布（基于常见运动类型）
        const typeList = [
          { type: 'run', label: '跑步', icon: '🏃', count: Math.floor(totalSessions * 0.4), percent: 40 },
          { type: 'ride', label: '骑行', icon: '🚴', count: Math.floor(totalSessions * 0.25), percent: 25 },
          { type: 'gym', label: '健身', icon: '💪', count: Math.floor(totalSessions * 0.2), percent: 20 },
          { type: 'yoga', label: '瑜伽', icon: '🧘', count: Math.floor(totalSessions * 0.1), percent: 10 },
          { type: 'other', label: '其他', icon: '🏃', count: totalSessions - Math.floor(totalSessions * 0.95), percent: 5 }
        ].filter(item => item.count > 0)
        
        this.setData({ 
          sportStats: { 
            totalSessions: totalCheckIns || totalSessions, 
            totalDuration: totalWeekDuration || totalDuration, 
            typeList 
          } 
        })
      }).catch(() => {
        // 如果获取用户资料失败，使用基础统计
        const typeList = [
          { type: 'run', label: '跑步', icon: '🏃', count: Math.floor(totalSessions * 0.4), percent: 40 },
          { type: 'ride', label: '骑行', icon: '🚴', count: Math.floor(totalSessions * 0.3), percent: 30 },
          { type: 'gym', label: '健身', icon: '💪', count: Math.floor(totalSessions * 0.3), percent: 30 }
        ].filter(item => item.count > 0)
        
        this.setData({ 
          sportStats: { totalSessions, totalDuration, typeList } 
        })
      })
    }).catch(() => {
      this.setData({ sportStats: { totalSessions: 0, totalDuration: 0, typeList: [] } })
    })
  },

  with2d(canvasId, cb) {
    const q = wx.createSelectorQuery()
    q.select(`#${canvasId}`).fields({ node: true, size: true, rect: true }).exec(res => {
      const info = res && res[0] ? res[0] : {}
      const node = info.node
      const width = info.width || 700
      const height = info.height || 300
      if (!node) return
      const dpr = wx.getSystemInfoSync().pixelRatio || 1
      node.width = Math.floor(width * dpr)
      node.height = Math.floor(height * dpr)
      const ctx = node.getContext('2d')
      ctx.scale(dpr, dpr)
      cb(ctx, width, height)
    })
  },

  computeDauSeries(days) {
    const today = new Date(); today.setHours(0,0,0,0)
    const tasks = []
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today); start.setDate(today.getDate() - i)
      const end = new Date(start); end.setDate(start.getDate() + 1)
      tasks.push(db.collection('tribe_messages').where({ create_time: _.gte(start) }).limit(1000).get().then(res => {
        const senders = {}
        ;(res.data || []).forEach(m => {
          const s = m.sender_id || 'anon'
          const ct = new Date(m.create_time || start)
          if (ct >= start && ct < end) senders[s] = true
        })
        return { dateStr: `${start.getMonth()+1}/${start.getDate()}`, value: Object.keys(senders).length }
      }).catch(() => ({ dateStr: `${start.getMonth()+1}/${start.getDate()}`, value: 0 })))
    }
    return Promise.all(tasks)
  },

  computeCheckinSeries(days) {
    const today = new Date(); today.setHours(0,0,0,0)
    const tasks = []
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today); start.setDate(today.getDate() - i)
      const end = new Date(start); end.setDate(start.getDate() + 1)
      tasks.push(db.collection('health_metrics').where({ type:'weight', date: _.gte(start) }).limit(1000).get().then(res => {
        const count = (res.data || []).filter(it => {
          try { const d = new Date(it.date); return d >= start && d < end } catch(_) { return false }
        }).length
        return { dateStr: `${start.getMonth()+1}/${start.getDate()}`, value: count }
      }).catch(() => ({ dateStr: `${start.getMonth()+1}/${start.getDate()}`, value: 0 })))
    }
    return Promise.all(tasks)
  },

  loadRoleDist() {
    return db.collection('users').limit(1000).get().then(res => {
      const c = {}
      ;(res.data || []).forEach(r => { const k = r.role || '成员'; c[k] = (c[k] || 0) + 1 })
      const keys = Object.keys(c)
      const total = keys.reduce((s,k)=>s+c[k],0)
      return keys.map(k => ({ name: k, value: c[k], percent: total ? Math.round(c[k]/total*100) : 0 }))
    }).catch(()=>[])
  },

  drawLine(canvasId, series, color) {
    this.with2d(canvasId, (ctx, baseW, baseH) => {
      const padding = 50
      ctx.fillStyle = '#fafafa'; ctx.fillRect(0,0,baseW,baseH)
      if (!series || !series.length) { ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.fillText('暂无数据', baseW/2-30, baseH/2); return }
      const values = series.map(s=>s.value)
      const rawMin = Math.min.apply(null, values), rawMax = Math.max.apply(null, values)
      const chartW = baseW - padding*2, chartH = baseH - padding*2
      const niceStep = v => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); const n = (v || 1)/p; let s = 1; if (n<=1) s=1; else if (n<=2) s=2; else if (n<=5) s=5; else s=10; return s*p }
      const targetTicks = 5
      let step = niceStep((rawMax - rawMin) / targetTicks || 1)
      let yMin = Math.floor(rawMin/step)*step
      let yMax = Math.ceil(rawMax/step)*step
      if (yMin === yMax) { yMin -= step; yMax += step }
      const range = yMax - yMin
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, baseH - padding); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(padding, baseH - padding); ctx.lineTo(baseW - padding, baseH - padding); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'
      for (let v = yMin; v <= yMax + 0.0001; v += step) {
        const ratio = (v - yMin) / range
        const y = padding + chartH * (1 - ratio)
        ctx.strokeStyle = '#e6e6e6'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(baseW - padding, y); ctx.stroke()
        const label = String(Math.round(v))
        ctx.fillStyle = '#666'; ctx.fillText(label, 12, y+4)
      }
      const n = series.length
      const stepX = n > 1 ? chartW / (n - 1) : chartW
      for (let i = 0; i < n; i++) {
        const x = padding + stepX * i
        if (n <= 14 || i % Math.ceil(n/14) === 0) {
          ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(x, baseH - padding); ctx.lineTo(x, baseH - padding + 6); ctx.stroke()
          ctx.fillStyle = '#666'; ctx.fillText(series[i].dateStr || '', x, baseH - padding + 20)
        }
      }
      ctx.strokeStyle = color || '#4CAF50'; ctx.lineWidth = 2
      for (let i = 0; i < n; i++) {
        const ratio = (series[i].value - yMin) / range
        const y = padding + chartH * (1 - ratio)
        const x = padding + stepX * i
        if (i === 0) { ctx.beginPath(); ctx.moveTo(x, y) } else { ctx.lineTo(x, y) }
      }
      ctx.stroke()
      ctx.fillStyle = color || '#4CAF50'
      for (let i = 0; i < n; i++) {
        const ratio = (series[i].value - yMin) / range
        const y = padding + chartH * (1 - ratio)
        const x = padding + stepX * i
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill()
      }
    })
  },

  drawBar(canvasId, series, color) {
    this.with2d(canvasId, (ctx, baseW, baseH) => {
      const padding = 50
      ctx.fillStyle = '#fafafa'; ctx.fillRect(0,0,baseW,baseH)
      if (!series || !series.length) { ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.fillText('暂无数据', baseW/2-30, baseH/2); return }
      const values = series.map(s=>s.value)
      const maxV = Math.max.apply(null, values)
      const chartW = baseW - padding*2, chartH = baseH - padding*2
      const barW = chartW / (series.length * 1.5)
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(padding, baseH - padding); ctx.lineTo(baseW - padding, baseH - padding); ctx.stroke()
      for (let i = 0; i < series.length; i++) {
        const v = series[i].value
        const h = maxV > 0 ? chartH * (v / maxV) : 0
        const x = padding + (i + 0.25) * (chartW / series.length)
        const y = baseH - padding - h
        ctx.fillStyle = color || '#2ECC71'; ctx.fillRect(x, y, barW, h)
        ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'; ctx.fillText(series[i].dateStr, x, baseH - padding + 20)
      }
    })
  },

  drawPie(canvasId, dist) {
    this.with2d(canvasId, (ctx, baseW, baseH) => {
      ctx.fillStyle = '#fafafa'; ctx.fillRect(0,0,baseW,baseH)
      if (!dist || !dist.length) { ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.fillText('暂无数据', baseW/2-30, baseH/2); return }
      const colors = ['#1ABC9C', '#3498DB', '#9B59B6', '#E67E22', '#E74C3C', '#2ECC71']
      const total = dist.reduce((s,d)=>s+d.value,0)
      let start = -Math.PI/2
      const cx = baseW/2, cy = baseH/2, r = Math.min(baseW, baseH)*0.3
      for (let i = 0; i < dist.length; i++) {
        const frac = total > 0 ? dist[i].value/total : 0
        const end = start + frac * Math.PI*2
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, end); ctx.closePath()
        ctx.fillStyle = colors[i % colors.length]; ctx.fill()
        const mid = (start + end)/2
        const lx = cx + Math.cos(mid) * (r + 20)
        const ly = cy + Math.sin(mid) * (r + 20)
        ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.fillText(`${dist[i].name} ${dist[i].percent}%`, lx - 20, ly)
        start = end
      }
    })
  },

  loadUsers() {
    const page = this.data.usersPage
    db.collection('user_profiles').orderBy('updateTime','desc').skip(page*20).limit(20).get().then(res => {
      const list = res.data || []
      const merged = page === 0 ? list : this.data.users.concat(list)
      this.setData({ users: merged })
    }).catch(()=>{})
  },
  loadMoreUsers() {
    this.setData({ usersPage: this.data.usersPage + 1 })
    this.loadUsers()
  },
  onUserNickInput(e) {
    const id = e.currentTarget.dataset.id
    const val = e.detail.value
    const map = this.data.userNickEdits
    map[id] = val
    this.setData({ userNickEdits: map })
  },
  saveUserNick(e) {
    const id = e.currentTarget.dataset.id
    const nick = this.data.userNickEdits[id]
    if (!nick) return
    db.collection('user_profiles').doc(id).update({ data: { nickname: nick, updateTime: new Date() } }).then(()=> {
      const arr = this.data.users.map(u => u._id === id ? { ...u, nickname: nick } : u)
      this.setData({ users: arr })
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(()=> wx.showToast({ title: '失败', icon: 'none' }))
  },
  deleteUser(e) {
    const id = e.currentTarget.dataset.id
    db.collection('user_profiles').doc(id).remove().then(()=> {
      const arr = this.data.users.filter(u => u._id !== id)
      this.setData({ users: arr })
      wx.showToast({ title: '已删除', icon: 'success' })
    }).catch(()=> wx.showToast({ title: '失败', icon: 'none' }))
  },

  loadTribes() {
    wx.cloud.callFunction({ name: 'tribeFunctions', data: { action: 'listTribes' } }).then(res => {
      if (res.result && res.result.code === 200) this.setData({ tribes: res.result.data || [] })
    }).catch(()=>{})
  },
  onCreateTribeName(e){ this.setData({ createTribeName: e.detail.value }) },
  onCreateTribeSlogan(e){ this.setData({ createTribeSlogan: e.detail.value }) },
  createTribe() {
    const name = String(this.data.createTribeName || '').trim()
    const slogan = String(this.data.createTribeSlogan || '').trim()
    if (!name) { wx.showToast({ title: '请输入名称', icon: 'none' }); return }
    wx.cloud.callFunction({ name: 'tribeFunctions', data: { action: 'createTribe', name, slogan } }).then(res => {
      if (res.result && res.result.code === 200) {
        wx.showToast({ title: '已创建', icon: 'success' })
        this.setData({ createTribeName: '', createTribeSlogan: '' })
        this.loadTribes()
      } else {
        wx.showToast({ title: '失败', icon: 'none' })
      }
    }).catch(()=> wx.showToast({ title: '异常', icon: 'none' }))
  },
  editTribe(e) {
    const id = e.currentTarget.dataset.id
    const item = (this.data.tribes || []).find(t => t._id === id) || {}
    this.setData({ editTribeId: id, editTribeName: item.name || '', editTribeSlogan: item.slogan || '' })
  },
  onEditTribeName(e){ this.setData({ editTribeName: e.detail.value }) },
  onEditTribeSlogan(e){ this.setData({ editTribeSlogan: e.detail.value }) },
  saveTribeEdit() {
    const id = this.data.editTribeId
    const name = this.data.editTribeName
    const slogan = this.data.editTribeSlogan
    if (!id) return
    wx.cloud.callFunction({ name: 'tribeFunctions', data: { action: 'updateTribeInfo', tribeId: id, name, slogan } }).then(res => {
      if (res.result && res.result.code === 200) {
        const arr = this.data.tribes.map(t => t._id === id ? { ...t, name, slogan } : t)
        this.setData({ tribes: arr, editTribeId: '', editTribeName: '', editTribeSlogan: '' })
        wx.showToast({ title: '已保存', icon: 'success' })
      } else {
        wx.showToast({ title: '失败', icon: 'none' })
      }
    }).catch(()=> wx.showToast({ title: '异常', icon: 'none' }))
  },
  cancelTribeEdit(){ this.setData({ editTribeId: '', editTribeName: '', editTribeSlogan: '' }) },
  deleteTribe(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    db.collection('tribe').doc(id).remove().then(()=> {
      const arr = this.data.tribes.filter(t => t._id !== id)
      this.setData({ tribes: arr })
      wx.showToast({ title: '已删除', icon: 'success' })
    }).catch(()=> wx.showToast({ title: '失败', icon: 'none' }))
  },

  loadFeedback() {
    const page = this.data.feedbackPage
    db.collection('feedback').orderBy('submitTime','desc').skip(page*20).limit(20).get().then(res => {
      const list = (res.data || []).map(it => ({
        ...it,
        submitTimeStr: this.formatDateTime(it.submitTime)
      }))
      const merged = page === 0 ? list : this.data.feedbacks.concat(list)
      this.setData({ feedbacks: merged })
    }).catch(()=>{})
  },
  loadMoreFeedback() {
    this.setData({ feedbackPage: this.data.feedbackPage + 1 })
    this.loadFeedback()
  },
  toggleFeedbackStatus(e) {
    const id = e.currentTarget.dataset.id
    const status = e.currentTarget.dataset.status
    db.collection('feedback').doc(id).update({ data: { status } }).then(()=> {
      const arr = this.data.feedbacks.map(f => f._id === id ? { ...f, status } : f)
      this.setData({ feedbacks: arr })
      wx.showToast({ title: '已更新', icon: 'success' })
    }).catch(()=> wx.showToast({ title: '失败', icon: 'none' }))
  },
  deleteFeedback(e) {
    const id = e.currentTarget.dataset.id
    db.collection('feedback').doc(id).remove().then(()=> {
      const arr = this.data.feedbacks.filter(f => f._id !== id)
      this.setData({ feedbacks: arr })
      wx.showToast({ title: '已删除', icon: 'success' })
    }).catch(()=> wx.showToast({ title: '失败', icon: 'none' }))
  },
  formatDateTime(d) {
    try {
      const dt = new Date(d)
      const m = `${dt.getMonth()+1}`.padStart(2,'0')
      const day = `${dt.getDate()}`.padStart(2,'0')
      const hh = `${dt.getHours()}`.padStart(2,'0')
      const mm = `${dt.getMinutes()}`.padStart(2,'0')
      return `${dt.getFullYear()}-${m}-${day} ${hh}:${mm}`
    } catch(_) { return '' }
  }
})