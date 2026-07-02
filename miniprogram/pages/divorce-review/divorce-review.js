const { get, post } = require('../../utils/request')
const { API_PATHS, STORAGE_KEYS } = require('../../utils/constants')

const STATUS_TEXT = {
  not_submitted: '未提交',
  pending: '审核中',
  approved: '审核通过',
  rejected: '审核驳回'
}

Page({
  data: {
    pageState: 'loading',
    status: 'not_submitted',
    statusText: STATUS_TEXT.not_submitted,
    message: '',
    rejectReason: '',
    contact_phone: '',
    review_note: '',
    showForm: true,
    submitting: false
  },

  onLoad() {
    this.loadStatus()
  },

  getOpenid() {
    const openid = wx.getStorageSync(STORAGE_KEYS.OPENID)
    if (openid) return openid

    wx.showModal({
      title: '请先登录',
      content: '请返回登录页完成微信登录后再提交申请。',
      showCancel: false,
      success: () => wx.redirectTo({ url: '/pages/login/login' })
    })
    return ''
  },

  applyStatus(data = {}) {
    const status = data.status || 'not_submitted'
    this.setData({
      pageState: 'success',
      status,
      statusText: data.status_text || STATUS_TEXT[status] || STATUS_TEXT.not_submitted,
      message: data.message || '',
      rejectReason: data.reject_reason || '',
      contact_phone: data.contact_phone || this.data.contact_phone,
      review_note: data.review_note || this.data.review_note,
      showForm: status === 'not_submitted' || status === 'rejected'
    })
  },

  async loadStatus() {
    const openid = this.getOpenid()
    if (!openid) return

    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    this.setData({ pageState: 'loading' })
    try {
      const data = await get(API_PATHS.DIVORCE_REVIEW_STATUS, { openid }, { showError: false })
      this.applyStatus(data)
    } catch (err) {
      this.setData({
        pageState: 'error',
        message: (err && err.message) || '状态加载失败'
      })
    }
  },

  onPhoneInput(e) {
    this.setData({ contact_phone: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ review_note: e.detail.value })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const openid = this.getOpenid()
    if (!openid) return

    const phone = String(this.data.contact_phone || '').trim()
    if (!/^\d{11}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的联系电话', icon: 'none' })
      return
    }

    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const sys = wx.getSystemInfoSync()
      const data = await post(API_PATHS.DIVORCE_REVIEW, {
        openid,
        contact_phone: phone,
        review_note: String(this.data.review_note || '').trim(),
        device_info: `${sys.model || ''} ${sys.system || ''}`.trim()
      }, { showLoading: true, loadingText: '提交中...' })

      this.applyStatus(data)
      wx.showToast({ title: '已提交', icon: 'success' })
    } catch (err) {
      wx.showModal({
        title: '提交失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  goChat() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  onRetry() {
    this.loadStatus()
  }
})
