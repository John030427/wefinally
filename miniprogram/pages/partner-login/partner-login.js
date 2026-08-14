const {
  onboardingStatus,
  submitPartnerApplication,
  activatePartner,
  restorePartnerSession
} = require('../../utils/partnerApi')

Page({
  data: {
    pageState: 'loading',
    status: { state: 'loading', allowed_actions: [] },
    phone: '',
    city: '',
    circleNote: '',
    reason: '',
    submitting: false,
    errorMsg: ''
  },

  onShow() { this.loadStatus() },

  async loadStatus() {
    this.setData({ pageState: 'loading', errorMsg: '' })
    try {
      const status = await onboardingStatus()
      this.setData({ pageState: 'success', status })
    } catch (err) {
      this.setData({ pageState: 'error', errorMsg: (err && err.message) || '合伙人状态加载失败' })
    }
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value, errorMsg: '' })
  },

  async submitApplication() {
    if (this.data.submitting) return
    const phone = String(this.data.phone || '').trim()
    const reason = String(this.data.reason || '').trim()
    if (!phone || !reason) return this.setData({ errorMsg: '请填写手机号和申请理由' })
    this.setData({ submitting: true, errorMsg: '' })
    try {
      await submitPartnerApplication({
        phone,
        city: String(this.data.city || '').trim(),
        circle_note: String(this.data.circleNote || '').trim(),
        reason,
        request_id: `partner-apply-${Date.now()}`
      })
      wx.showToast({ title: '申请已提交', icon: 'success' })
      await this.loadStatus()
    } catch (err) {
      this.setData({ errorMsg: (err && err.message) || '申请提交失败' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onVerifyPhone(e) {
    if (this.data.submitting) return
    const code = e && e.detail && e.detail.code
    if (!code) {
      this.setData({ errorMsg: '你已取消手机号授权，资格不会发生变化' })
      return
    }
    this.setData({ submitting: true, errorMsg: '' })
    try {
      await activatePartner(code, `partner-activate-${Date.now()}`)
      wx.showToast({ title: '合伙人身份已激活', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: '/pages/partner-invite/partner-invite' }), 500)
    } catch (err) {
      this.setData({ errorMsg: (err && err.message) || '手机号未获资格或验证不一致' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async goDashboard() {
    try {
      await restorePartnerSession()
      wx.redirectTo({ url: '/pages/partner-invite/partner-invite' })
    } catch (err) {
      this.setData({ errorMsg: (err && err.message) || '会话恢复失败' })
    }
  },

  contactSupport() {
    wx.navigateTo({ url: '/pages/chat/chat?agentType=platform_service' })
  }
})
