const { get, put } = require('../../utils/request')
const { API_PATHS, STORAGE_KEYS } = require('../../utils/constants')

const MAX_LEN = 500

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    appearanceDescription: '',
    appearanceWant: '',
    descLen: 0,
    wantLen: 0,
    maxLen: MAX_LEN,
    submitting: false
  },

  onLoad() {
    this.loadProfile()
  },

  async loadProfile() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }
    try {
      const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      const appearanceDescription = profile.appearance_description || ''
      const appearanceWant = profile.appearance_want || ''
      this.setData({
        pageState: 'success',
        appearanceDescription,
        appearanceWant,
        descLen: appearanceDescription.length,
        wantLen: appearanceWant.length
      })
    } catch (e) {
      this.setData({ pageState: 'error', errorMsg: (e && e.message) || '加载失败' })
    }
  },

  onRetry() {
    this.loadProfile()
  },

  onDescInput(e) {
    const v = e.detail.value || ''
    this.setData({ appearanceDescription: v, descLen: v.length })
  },

  onWantInput(e) {
    const v = e.detail.value || ''
    this.setData({ appearanceWant: v, wantLen: v.length })
  },

  async onSubmit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const profile = await put(API_PATHS.USER_PROFILE_UPDATE, {
        appearance_description: this.data.appearanceDescription.trim(),
        appearance_want: this.data.appearanceWant.trim()
      }, { showLoading: true, loadingText: '保存中...' })
      const app = getApp()
      app.globalData.userInfo = profile
      wx.setStorageSync(STORAGE_KEYS.USER_INFO, profile)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      wx.showModal({ title: '保存失败', content: (e && e.message) || '请稍后重试', showCancel: false })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
