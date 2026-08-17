const { get, post } = require('../../utils/request')
const { GUANGDONG_110_DEFAULT } = require('../../utils/constants')
const { normalizeChosenLocation, hasMapLocation, shouldCreateBlankReport } = require('../../utils/meetLocation')

Page({
  data: {
    form: {
      match_user_id: 0,
      match_log_id: 0,
      meet_time: '',
      meet_place: '',
      meet_address: '',
      lat: null,
      lng: null,
      location_source: '',
      meet_note: '',
      emergency_contact: ''
    },
    ack: false,
    meetDate: '',
    meetClock: '',
    created: null,
    shareMode: false,
    safetyTips: '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。'
  },

  onLoad(options) {
    if (shouldCreateBlankReport(options)) return
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
          meet_address: r.meet_address || '',
          lat: r.lat,
          lng: r.lng,
          location_source: r.location_source || '',
          meet_note: r.meet_note || '',
          emergency_contact: r.emergency_contact || ''
        },
        meetDate: timeParts.meetDate,
        meetClock: timeParts.meetClock,
        ack: !!r.safety_ack,
        created: { id: r.id, card_no: r.card_no, share_token: r.share_token },
        shareMode: false
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
          meet_address: r.meet_address || '',
          lat: r.lat,
          lng: r.lng,
          location_source: r.location_source || '',
          meet_note: r.meet_note || '',
          emergency_contact: ''
        },
        meetDate: timeParts.meetDate,
        meetClock: timeParts.meetClock,
        safetyTips: r.safety_prompt || this.data.safetyTips,
        ack: true,
        created: { id: r.id, card_no: r.card_no, share_token: r.share_token },
        shareMode: true
      })
    } catch (e) {
      wx.showModal({ title: '分享卡不可用', content: (e && e.message) || '该安全确认卡不存在或已失效', showCancel: false })
    }
  },

  chooseMeetLocation() {
    if (typeof wx.chooseLocation !== 'function') {
      wx.showModal({ title: '暂不支持地图选点', content: '请升级微信或在真机中重新打开小程序。', showCancel: false })
      return
    }
    wx.chooseLocation({
      success: (result) => {
        const location = normalizeChosenLocation(result)
        if (!hasMapLocation(location)) {
          wx.showToast({ title: '没有获取到有效地点', icon: 'none' })
          return
        }
        this.setData({
          'form.meet_place': location.meet_place,
          'form.meet_address': location.meet_address,
          'form.lat': location.lat,
          'form.lng': location.lng,
          'form.location_source': location.location_source
        })
        wx.showToast({ title: '地点已选好', icon: 'success' })
      },
      fail: (err) => {
        const message = String(err && err.errMsg || '')
        if (message.includes('cancel')) return
        wx.showModal({
          title: '无法选择地点',
          content: '请在微信设置中允许位置信息权限后重试。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm && wx.openSetting) wx.openSetting({})
          }
        })
      }
    })
  },

  openMeetLocation() {
    if (!hasMapLocation(this.data.form)) return wx.showToast({ title: '请先选择地点', icon: 'none' })
    if (typeof wx.openLocation !== 'function') return wx.showToast({ title: '当前微信版本不支持查看地图', icon: 'none' })
    wx.openLocation({
      latitude: Number(this.data.form.lat),
      longitude: Number(this.data.form.lng),
      name: this.data.form.meet_place || '见面地点',
      address: this.data.form.meet_address || '',
      scale: 17
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
    if (!hasMapLocation(this.data.form)) return wx.showToast({ title: '请先在地图中选择见面地点', icon: 'none' })
    try {
      const d = await post('/api/meet/create', Object.assign({}, this.data.form, { safety_ack: 1 }), { showLoading: true })
      this.setData({ created: d, shareMode: false })
      wx.showToast({ title: '已报备', icon: 'success' })
    } catch (e) {
      wx.showModal({ title: '失败', content: (e && e.message) || '', showCancel: false })
    }
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
    const lat = location && location.lat !== undefined ? location.lat : this.data.form.lat
    const lng = location && location.lng !== undefined ? location.lng : this.data.form.lng
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
