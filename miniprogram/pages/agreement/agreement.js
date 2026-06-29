const { STORAGE_KEYS, AGREEMENT_ITEMS } = require('../../utils/constants')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    agreementItems: AGREEMENT_ITEMS,
    checked: {
      userAgreement: false,
      privacyPolicy: false,
      dataAuth: false
    },
    allChecked: false,
    submitting: false
  },

  onLoad() {
    this.initPage()
  },

  async initPage() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }
    this.setData({ pageState: 'success' })
  },

  onRetry() {
    this.initPage()
  },

  onCheckChange(e) {
    const key = e.currentTarget.dataset.key
    const checked = { ...this.data.checked, [key]: !this.data.checked[key] }
    const allChecked = AGREEMENT_ITEMS.every((item) => checked[item.key])
    this.setData({ checked, allChecked })
  },

  viewAgreement(e) {
    const type = e.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/rules/rules?type=${type}` })
  },

  onSubmit() {
    if (!this.data.allChecked) {
      wx.showToast({ title: '请勾选全部协议', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    wx.setStorageSync(STORAGE_KEYS.AGREEMENT_ACCEPTED, true)
    wx.showToast({ title: '协议确认成功', icon: 'success' })

    setTimeout(() => {
      this.setData({ submitting: false })
      wx.redirectTo({ url: '/pages/register/register' })
    }, 1000)
  }
})
