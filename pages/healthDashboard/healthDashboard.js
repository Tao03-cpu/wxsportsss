// 云数据库实例（用于读写健康数据与用户资料）
const db = wx.cloud.database()
// 数据库命令（例如大于/小于等条件查询）
const _ = db.command

Page({
  data: {
    // 身高（厘米）
    heightCm: '',
    // 最新体重（千克），与用户资料同步
    latestWeight: '',
    // 输入框：记录今日体重（千克）
    recordWeight: '',
    // BMI 数值与分级文案
    bmi: '--',
    bmiText: '',
    // 体重记录列表（用于趋势图与明细）
    records: [],
    
  },

  // 页面加载：拉取资料与体重记录
  onLoad() { this.loadProfile(); this.loadRecords(); },
  // 页面显示：刷新体重记录
  onShow() { this.loadRecords(); },

  loadProfile() {
    // 从用户资料中读取身高与体重，用于 BMI 计算
    wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'fetch' } })
      .then(res => {
        const p = (res.result && (res.result.profile || res.result.data)) || {}
        this.setData({ heightCm: p.height || '', latestWeight: p.weight || '' })
        this.updateBmi()
      })
  },

  saveProfile() {
    // 将当前页面的身高/体重写回用户资料
    const height = parseFloat(this.data.heightCm)
    const weight = parseFloat(this.data.latestWeight)
    wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'save', profileData: { height, weight } } })
      .then(()=>{ wx.showToast({ title: '已保存', icon: 'success' }); this.updateBmi() })
      .catch(()=> wx.showToast({ title: '保存失败', icon: 'none' }))
  },

  // 输入事件：联动更新 BMI
  onHeightInput(e){ this.setData({ heightCm: e.detail.value }); this.updateBmi() },
  onWeightInput(e){ this.setData({ latestWeight: e.detail.value }); this.updateBmi() },
  onRecordInput(e){ this.setData({ recordWeight: e.detail.value }); },

  addWeightRecord() {
    // 新增一条今日体重记录，并刷新列表与资料
    const w = parseFloat(this.data.recordWeight)
    if (!(w > 0)) { wx.showToast({ title: '请输入有效体重', icon: 'none' }); return }
    const now = new Date(); now.setHours(0,0,0,0)
    db.collection('health_metrics').add({ data: { type: 'weight', weight: w, date: now, createTime: db.serverDate() } })
      .then(()=>{ wx.showToast({ title: '已记录', icon: 'success' }); this.setData({ latestWeight: String(w), recordWeight: '' }); this.saveProfile(); this.loadRecords(); })
      .catch(()=> {
        // 如果集合不存在，尝试自动创建后重试
        wx.cloud.callFunction({ name: 'dbInit', data: { collection: 'health_metrics' } })
          .then(()=> this.addWeightRecord())
          .catch(()=> wx.showToast({ title: '记录失败', icon: 'none' }))
      })
  },

  loadRecords() {
    db.collection('health_metrics').where({ type: 'weight' }).orderBy('date','asc').limit(180).get()
      .then(res => {
        const list = (res.data || []).map(it => ({ ...it, dateStr: this.formatDate(it.date) }))
        this.setData({ records: list })
        this.renderTrend(list)
      })
      .catch(()=> {
        wx.cloud.callFunction({ name: 'dbInit', data: { collection: 'health_metrics' } })
          .then(()=> this.loadRecords())
      })
  },

  updateBmi() {
    // BMI = 体重(kg) / 身高(m)^2
    const h = parseFloat(this.data.heightCm)
    const w = parseFloat(this.data.latestWeight)
    if (h > 0 && w > 0) {
      const bmi = (w / Math.pow(h/100, 2)).toFixed(1)
      this.setData({ bmi, bmiText: this.bmiCategory(parseFloat(bmi)) })
    }
  },

  bmiCategory(b) {
    // BMI 分级：<18.5 偏瘦；<24 正常；<28 超重；否则肥胖
    if (b < 18.5) return '偏瘦'
    if (b < 24) return '正常'
    if (b < 28) return '超重'
    return '肥胖'
  },

  // 日期格式化（MM/DD），用于横轴标签与明细列表
  formatDate(d){ try { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}` } catch(_) { return '' } },

  // 根据实际 canvas 可视尺寸进行自适应缩放绘制
  renderTrend(list) {
    const q = wx.createSelectorQuery();
    q.select('.trend-canvas').boundingClientRect(rect => {
      const cw = (rect && rect.width) ? rect.width : 700
      const ch = (rect && rect.height) ? rect.height : 300
      this.drawTrend(list, cw, ch)
    }).exec()
  },

  drawTrend(list, cw, ch) {
    const ctx = wx.createCanvasContext('trendCanvas', this)
    const baseW = 700, baseH = 300
    const padding = 50
    const scaleX = cw / baseW
    const scaleY = ch / baseH
    ctx.scale(scaleX, scaleY)
    ctx.setFillStyle('#fafafa'); ctx.fillRect(0,0,baseW,baseH)
    if (!list.length) { ctx.setFillStyle('#999'); ctx.setFontSize(14); ctx.fillText('暂无记录', baseW/2-40, baseH/2); ctx.draw(); return }
    const weights = list.filter(x=>x && isFinite(x.weight)).map(x=>x.weight)
    if (!weights.length) { ctx.setFillStyle('#999'); ctx.setFontSize(14); ctx.fillText('暂无可用体重数据', baseW/2-70, baseH/2); ctx.draw(); return }
    const rawMin = Math.min.apply(null, weights), rawMax = Math.max.apply(null, weights)
    const chartW = baseW - padding*2, chartH = baseH - padding*2
    const niceStep = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); const n = (v || 1)/p; let s = 1; if (n<=1) s=1; else if (n<=2) s=2; else if (n<=5) s=5; else s=10; return s*p; }
    const targetTicks = 5
    let step = niceStep((rawMax - rawMin) / targetTicks || 1)
    let yMin = Math.floor(rawMin/step)*step
    let yMax = Math.ceil(rawMax/step)*step
    if (yMin === yMax) { yMin -= step; yMax += step }
    const range = yMax - yMin
    ctx.setStrokeStyle('#bbb'); ctx.setLineWidth(1)
    ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, baseH - padding); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(padding, baseH - padding); ctx.lineTo(baseW - padding, baseH - padding); ctx.stroke()
    ctx.setFillStyle('#666'); ctx.setFontSize(12)
    for (let v = yMin; v <= yMax + 0.0001; v += step) {
      const ratio = (v - yMin) / range
      const y = padding + chartH * (1 - ratio)
      ctx.setStrokeStyle('#e6e6e6'); ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(baseW - padding, y); ctx.stroke()
      const label = step < 1 ? v.toFixed(1) : String(Math.round(v))
      ctx.setFillStyle('#666'); ctx.fillText(label, 12, y+4)
    }
    const n = list.length
    const stepX = n > 1 ? chartW / (n - 1) : chartW
    for (let i = 0; i < n; i++) {
      const x = padding + stepX * i
      if (n <= 14 || i % Math.ceil(n/14) === 0) {
        ctx.setStrokeStyle('#bbb'); ctx.beginPath(); ctx.moveTo(x, baseH - padding); ctx.lineTo(x, baseH - padding + 6); ctx.stroke()
        ctx.setFillStyle('#666'); ctx.fillText(list[i].dateStr || '', x, baseH - padding + 20)
      }
    }
    ctx.setStrokeStyle('#4CAF50'); ctx.setLineWidth(2)
    for (let i = 0; i < n; i++) {
      const ratio = (list[i].weight - yMin) / range
      const y = padding + chartH * (1 - ratio)
      const x = padding + stepX * i
      if (i === 0) { ctx.beginPath(); ctx.moveTo(x, y) } else { ctx.lineTo(x, y) }
    }
    ctx.stroke()
    ctx.setFillStyle('#4CAF50')
    for (let i = 0; i < n; i++) {
      const ratio = (list[i].weight - yMin) / range
      const y = padding + chartH * (1 - ratio)
      const x = padding + stepX * i
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill()
    }
    ctx.draw()
  }
  ,
  // 生成 7 天周期数据：根据偏移量计算起止日期，若某天无记录则显示空或沿用最近一次体重
  getWeekSeries(all, offset) {
    const end = new Date(); end.setHours(0,0,0,0); end.setDate(end.getDate() - offset*7)
    const start = new Date(end); start.setDate(end.getDate() - 6)
    const series = []
    let lastWeight = this.data.latestWeight ? parseFloat(this.data.latestWeight) : undefined
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`
      const found = (all || []).find(it => {
        const dd = new Date(it.date)
        return dd.getFullYear()===d.getFullYear() && dd.getMonth()===d.getMonth() && dd.getDate()===d.getDate()
      })
      const weight = found ? Number(found.weight) : (lastWeight !== undefined ? lastWeight : undefined)
      if (found) lastWeight = Number(found.weight)
      series.push({ date: d, dateStr: `${d.getMonth()+1}/${d.getDate()}`, weight })
    }
    return series
  },
  // 更新周标签显示（如 11/28 - 12/4 或 “本周”）
  updateWeekLabel(series) {
    if (!series || !series.length) { this.setData({ weekLabel: '' }); return }
    const s = series[0].dateStr, e = series[series.length-1].dateStr
    this.setData({ weekLabel: this.data.weekOffset===0 ? '本周' : `${s} - ${e}` })
  },
  // 查看上一周
  prevWeek() {
    const off = this.data.weekOffset + 1
    this.setData({ weekOffset: off })
    const series = this.getWeekSeries(this.data.records, off)
    this.updateWeekLabel(series)
    this.renderTrend(series)
  },
  // 查看下一周（不超过本周）
  nextWeek() {
    if (this.data.weekOffset===0) return
    const off = Math.max(0, this.data.weekOffset - 1)
    this.setData({ weekOffset: off })
    const series = this.getWeekSeries(this.data.records, off)
    this.updateWeekLabel(series)
    this.renderTrend(series)
  }
})
