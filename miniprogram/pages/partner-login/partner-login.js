const {
  onboardingStatus,
  activatePartner,
  restorePartnerSession
} = require('../../utils/partnerApi')

Page({
  data: {
    pageState: 'loading',
    status: { state: 'loading', allowed_actions: [] },
    phone: '',
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

  async activateByPhone() {
    if (this.data.submitting) return
    const phone = String(this.data.phone || '').replace(/\s+/g, '')
    if (!/^1[3-9][0-9]{9}$/.test(phone)) return this.setData({ errorMsg: '请输入名单中的11位手机号' })
    this.setData({ submitting: true, errorMsg: '' })
    try {
      await activatePartner(phone, `partner-activate-${Date.now()}`)
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
