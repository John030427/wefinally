const { loginPartner } = require('../../utils/partnerApi')
const { STORAGE_KEYS } = require('../../utils/constants')

Page({
  data: {
    phone: '',
    password: '',
    submitting: false,
    errorMsg: ''
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value, errorMsg: '' })
  },

  async submit() {
    if (this.data.submitting) return
    const phone = String(this.data.phone || '').trim()
    const password = String(this.data.password || '')
    if (!phone || !password) {
      this.setData({ errorMsg: '请输入合伙人手机号和密码' })
      return
    }
    this.setData({ submitting: true, errorMsg: '' })
    try {
      const result = await loginPartner(phone, password)
      if (!result || !result.token) throw new Error('合伙人登录响应无效')
      wx.setStorageSync(STORAGE_KEYS.PARTNER_TOKEN, result.token)
      wx.setStorageSync(STORAGE_KEYS.PARTNER_INFO, result.partner || {})
      wx.redirectTo({ url: '/pages/partner-invite/partner-invite' })
    } catch (err) {
      this.setData({ errorMsg: (err && err.message) || '登录失败，请稍后重试' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
