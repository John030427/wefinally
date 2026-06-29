const { get, post } = require('../../utils/request')

Page({
  data: {
    form: {
      match_user_id: 0,
      meet_time: '',
      meet_place: '',
      lat: null,
      lng: null,
      meet_note: '',
      emergency_contact: ''
    },
    ack: false,
    created: null,
    safetyTips: '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。'
  },

  onLoad(options) {
    if (options.id) {
      this.loadReport(options.id)
      return
    }
    if (options.matchUserId) {
      this.setData({ 'form.match_user_id': Number(options.matchUserId) || 0 })
    }
  },

  async loadReport(id) {
    try {
      const r = await get(`/api/meet/${id}`, {}, { showLoading: true })
      this.setData({
        form: {
          match_user_id: r.match_user_id || 0,
          meet_time: r.meet_time || '',
          meet_place: r.meet_place || '',
          lat: r.lat,
          lng: r.lng,
          meet_note: r.meet_note || '',
          emergency_contact: r.emergency_contact || ''
        },
        ack: !!r.safety_ack,
        created: { id: r.id, card_no: r.card_no }
      })
    } catch (e) {
      wx.showModal({ title: '加载失败', content: (e && e.message) || '记录不存在', showCancel: false })
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

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value })
  },

  toggleAck() {
    this.setData({ ack: !this.data.ack })
  },

  async submit() {
    if (!this.data.ack) return wx.showToast({ title: '请勾选安全提示', icon: 'none' })
    try {
      const d = await post('/api/meet/create', { ...this.data.form, safety_ack: 1 }, { showLoading: true })
      this.setData({ created: d })
      wx.showToast({ title: '已报备', icon: 'success' })
    } catch (e) {
      wx.showModal({ title: '失败', content: (e && e.message) || '', showCancel: false })
    }
  },

  async sos() {
    const id = this.data.created && this.data.created.id
    if (!id) return
    const { lat, lng } = this.data.form
    let r = {}
    try {
      r = await post(`/api/meet/${id}/sos`, { lat, lng })
    } catch (e) {}
    wx.makePhoneCall({ phoneNumber: (r && r.sosPhone) || '110' })
    if (r && r.emergency_contact) {
      wx.showModal({ title: '同时联系紧急联系人', content: r.emergency_contact, showCancel: false })
    }
  }
})
