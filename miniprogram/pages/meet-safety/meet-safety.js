const { get, post } = require('../../utils/request')
const { GUANGDONG_110_DEFAULT } = require('../../utils/constants')

Page({
  data: {
    form: {
      match_user_id: 0,
      match_log_id: 0,
      meet_time: '',
      meet_place: '',
      lat: null,
      lng: null,
      meet_note: '',
      emergency_contact: ''
    },
    ack: false,
    meetDate: '',
    meetClock: '',
    created: null,
    shareMode: false,
    guarding: false,
    locationCount: 0,
    latestLocationText: '',
    lastLocationUploadAt: 0,
    locationUploadIntervalMs: 30000,
    safetyTips: '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。'
  },

  onLoad(options) {
    if (options.shareToken) {
      this.loadSharedReport(options.shareToken)
      return
    }
    if (options.id) {
      this.loadReport(options.id)
      return
    }
    if (options.matchUserId) {
      this.setData({
        'form.match_user_id': Number(options.matchUserId) || 0,
        'form.match_log_id': Number(options.matchLogId) || 0
      })
      this.loadExistingForMatch(options.matchUserId)
      return
    }
    this.loadLatestReport()
  },

  onUnload() {
    this.stopLocationWatch()
  },

  formatTimeText(value) {
    if (!value) return ''
    return String(value).replace('T', ' ').slice(0, 16)
  },

  splitMeetTime(value) {
    const text = this.formatTimeText(value)
    if (!text) return { meetDate: '', meetClock: '' }
    const parts = text.split(' ')
    return {
      meetDate: parts[0] || '',
      meetClock: parts[1] || ''
    }
  },

  syncMeetTime(meetDate, meetClock) {
    const date = meetDate || ''
    const clock = meetClock || ''
    this.setData({
      meetDate: date,
      meetClock: clock,
      'form.meet_time': date ? `${date} ${clock || '00:00'}` : ''
    })
  },

  async loadLatestReport() {
    try {
      const rows = await get('/api/meet/list', {}, { showLoading: true, showError: false })
      const list = Array.isArray(rows) ? rows : []
      const latest = list.find((row) => row && Number(row.status) !== 2)
      if (latest && latest.id) {
        this.loadReport(latest.id)
      }
    } catch (e) {}
  },

  async loadExistingForMatch(matchUserId) {
    try {
      const r = await get('/api/meet/existing', {
        match_user_id: Number(matchUserId) || 0
      }, { showLoading: true, showError: false })
      if (r && r.id) {
        this.loadReport(r.id)
      }
    } catch (e) {}
  },

  async loadReport(id) {
    try {
      const r = await get(`/api/meet/${id}`, {}, { showLoading: true })
      const timeParts = this.splitMeetTime(r.meet_time || '')
      this.setData({
        form: {
          match_user_id: r.match_user_id || 0,
          match_log_id: r.match_log_id || 0,
          meet_time: r.meet_time || '',
          meet_place: r.meet_place || '',
          lat: r.lat,
          lng: r.lng,
          meet_note: r.meet_note || '',
          emergency_contact: r.emergency_contact || ''
        },
        meetDate: timeParts.meetDate,
        meetClock: timeParts.meetClock,
        ack: !!r.safety_ack,
        created: { id: r.id, card_no: r.card_no, share_token: r.share_token },
        shareMode: false,
        locationCount: Number(r.location_count || 0),
        latestLocationText: this.formatTimeText(r.latest_location_time)
      })
    } catch (e) {
      wx.showModal({ title: '加载失败', content: (e && e.message) || '记录不存在', showCancel: false })
    }
  },

  async loadSharedReport(token) {
    try {
      const r = await get(`/api/meet/share/${token}`, {}, { showLoading: true, showError: false })
      const timeParts = this.splitMeetTime(r.meet_time || '')
      this.setData({
        form: {
          match_user_id: 0,
          match_log_id: 0,
          meet_time: r.meet_time || '',
          meet_place: r.meet_place || '',
          lat: r.lat,
          lng: r.lng,
          meet_note: r.meet_note || '',
          emergency_contact: ''
        },
        meetDate: timeParts.meetDate,
        meetClock: timeParts.meetClock,
        safetyTips: r.safety_prompt || this.data.safetyTips,
        ack: true,
        created: { id: r.id, card_no: r.card_no, share_token: r.share_token },
        shareMode: true,
        guarding: false,
        locationCount: Number(r.location_count || 0),
        latestLocationText: this.formatTimeText(r.latest_location_time)
      })
    } catch (e) {
      wx.showModal({ title: '分享卡不可用', content: (e && e.message) || '该安全确认卡不存在或已失效', showCancel: false })
    }
  },

  getLoc() {
    wx.getLocation({
      type: 'gcj02',
      success: (r) => {
        this.setData({ 'form.lat': r.latitude, 'form.lng': r.longitude })
        wx.showToast({ title: '定位已获取', icon: 'success' })
      },
      fail: () => wx.showModal({ title: '需要定位授权', content: '请在设置中允许位置权限', showCancel: false })
    })
  },

  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!wx.getLocation) {
        reject(new Error('当前环境不支持定位'))
        return
      }
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject
      })
    })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value })
  },

  onMeetDateChange(e) {
    this.syncMeetTime(e.detail.value, this.data.meetClock)
  },

  onMeetClockChange(e) {
    this.syncMeetTime(this.data.meetDate, e.detail.value)
  },

  toggleAck() {
    this.setData({ ack: !this.data.ack })
  },

  async submit() {
    if (!this.data.ack) return wx.showToast({ title: '请勾选安全提示', icon: 'none' })
    try {
      const d = await post('/api/meet/create', Object.assign({}, this.data.form, { safety_ack: 1 }), { showLoading: true })
      this.setData({ created: d, shareMode: false, locationCount: 0, latestLocationText: '' })
      wx.showToast({ title: '已报备', icon: 'success' })
    } catch (e) {
      wx.showModal({ title: '失败', content: (e && e.message) || '', showCancel: false })
    }
  },

  async uploadLocation(r, source) {
    const id = this.data.created && this.data.created.id
    if (!id || !r) return
    const lat = r.latitude
    const lng = r.longitude
    this.setData({
      'form.lat': lat,
      'form.lng': lng,
      lastLocationUploadAt: Date.now()
    })
    const saved = await post(`/api/meet/${id}/location`, {
      lat,
      lng,
      accuracy: r.accuracy,
      source: source || 'watch'
    }, { showError: false }).catch(() => {})
    this.setData({
      locationCount: saved && saved.location_count ? Number(saved.location_count) : this.data.locationCount + 1,
      latestLocationText: this.formatTimeText(saved && saved.latest_location_time ? saved.latest_location_time : new Date())
    })
  },

  async startGuard() {
    const id = this.data.created && this.data.created.id
    if (!id) return wx.showToast({ title: '请先提交安全确认', icon: 'none' })
    if (this.data.guarding) return
    if (!wx.startLocationUpdate || !wx.onLocationChange) {
      wx.showModal({ title: '无法开启', content: '当前微信版本不支持实时位置守护，请升级微信后再试。', showCancel: false })
      return
    }

    this._locationHandler = (r) => {
      const now = Date.now()
      if (now - this.data.lastLocationUploadAt < this.data.locationUploadIntervalMs) return
      this.uploadLocation(r, 'watch')
    }
    wx.onLocationChange(this._locationHandler)
    wx.startLocationUpdate({
      type: 'gcj02',
      success: async () => {
        this.setData({ guarding: true })
        wx.showToast({ title: '前台守护已开启', icon: 'success' })
        try {
          const loc = await this.getCurrentLocation()
          await this.uploadLocation(loc, 'start')
        } catch (e) {}
      },
      fail: () => {
        this.stopLocationWatch()
        wx.showModal({ title: '需要定位授权', content: '请在微信设置中允许位置权限后再开启安全守护。', showCancel: false })
      }
    })
  },

  stopLocationWatch() {
    if (wx.offLocationChange && this._locationHandler) {
      wx.offLocationChange(this._locationHandler)
    }
    this._locationHandler = null
    if (wx.stopLocationUpdate) {
      wx.stopLocationUpdate({})
    }
    if (this.data.guarding) {
      this.setData({ guarding: false })
    }
  },

  async stopGuard() {
    const id = this.data.created && this.data.created.id
    this.stopLocationWatch()
    if (id) {
      await post(`/api/meet/${id}/finish`, {}, { showError: false }).catch(() => {})
    }
    wx.showToast({ title: '守护已结束', icon: 'none' })
  },

  toggleGuard() {
    if (this.data.guarding) {
      this.stopGuard()
      return
    }
    this.startGuard()
  },

  getCreatedId() {
    const created = this.data.created || {}
    return created.id || created.report_id || created.reportId || created.meet_report_id || created.meetReportId || 0
  },

  sos() {
    const id = this.getCreatedId()
    if (this.data.shareMode) return wx.showToast({ title: '分享卡仅供查看', icon: 'none' })
    if (!id) return wx.showToast({ title: '请先提交安全确认', icon: 'none' })
    let loc = { lat: this.data.form.lat, lng: this.data.form.lng }
    this.openEmergencyHelp({ location: loc })
    this.recordMeetSos(id, loc)
  },

  async recordMeetSos(id, location) {
    let lat = location && location.lat !== undefined ? location.lat : this.data.form.lat
    let lng = location && location.lng !== undefined ? location.lng : this.data.form.lng
    try {
      const current = await this.getCurrentLocation()
      lat = current.latitude
      lng = current.longitude
      this.setData({ 'form.lat': lat, 'form.lng': lng })
    } catch (e) {}
    let r = {}
    try {
      r = await post(`/api/meet/${id}/sos`, { lat, lng }, { showError: false })
    } catch (e) {}
    if (r && r.emergency_contact) {
      console.log('[WeFinally] SOS emergency contact', r.emergency_contact)
    }
  },

  openEmergencyHelp(r = {}) {
    const gd110 = r.guangdong110 || GUANGDONG_110_DEFAULT
    if (gd110.enabled !== false && gd110.appId) {
      this.openGuangdong110MiniProgram(gd110, r.location || {})
      return
    }

    this.showGuangdong110Fail({ errMsg: '广东110 appId 未配置' })
  },

  buildGuangdong110ExtraData(location = {}) {
    const data = { source: 'wefinally' }
    if (location.lat !== undefined && location.lat !== null) data.lat = location.lat
    if (location.lng !== undefined && location.lng !== null) data.lng = location.lng
    return data
  },

  openGuangdong110MiniProgram(gd110, location) {
    const options = {
      appId: gd110.appId,
      extraData: this.buildGuangdong110ExtraData(location),
      fail: (err) => this.showGuangdong110Fail(err)
    }
    if (gd110.path) options.path = gd110.path
    if (typeof wx.navigateToMiniProgram !== 'function') {
      this.showGuangdong110Fail({ errMsg: 'navigateToMiniProgram unavailable' })
      return
    }
    try {
      wx.navigateToMiniProgram(options)
    } catch (err) {
      this.showGuangdong110Fail(err)
    }
  },

  showGuangdong110Fail(err) {
    const msg = err && err.errMsg ? err.errMsg : '未知错误'
    wx.showModal({
      title: '广东110打开失败',
      content: `未能自动打开广东110小程序。\n\n微信错误：${msg}\n\n请在微信搜索“广东110”进入官方报警小程序。`,
      confirmText: '复制名称',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm && wx.setClipboardData) {
          wx.setClipboardData({ data: '广东110' })
        }
      }
    })
  },

  onShareAppMessage() {
    const created = this.data.created || {}
    const token = created.share_token || ''
    const time = this.data.form.meet_time ? ` ${this.formatTimeText(this.data.form.meet_time)}` : ''
    const place = this.data.form.meet_place ? ` ${this.data.form.meet_place}` : ''
    return {
      title: `我已提交 WeFinally 见面安全确认${time}${place}`,
      path: token ? `/pages/meet-safety/meet-safety?shareToken=${token}` : '/pages/meet-safety/meet-safety'
    }
  }
})
