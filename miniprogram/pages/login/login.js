const { post } = require('../../utils/request')
const { API_PATHS, STORAGE_KEYS } = require('../../utils/constants')

Page({
  data: {
    pageState: 'success',
    errorMsg: '',
    logging: false
  },

  onLoad() {
    this.checkNetworkAndInit()
  },

  checkNetworkAndInit() {
    const app = getApp()
    if (app.globalData.isLoggedIn) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }

    app.checkNetwork().then((hasNetwork) => {
      if (!hasNetwork) {
        this.setData({ pageState: 'no-network' })
        return
      }
      this.setData({ pageState: 'success' })
    })
  },

  onRetry() {
    this.checkNetworkAndInit()
  },

  goRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  },

  onWxLogin() {
    if (this.data.logging) return
    const app = getApp()
    app.checkNetwork().then((hasNetwork) => {
      if (!hasNetwork) {
        wx.showToast({ title: '网络不可用', icon: 'none' })
        return
      }

      this.setData({ logging: true })
      return new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      }).then((loginRes) => {
        if (!loginRes.code) throw new Error('获取登录凭证失败')
        const payload = { code: loginRes.code }
        const devOpenid = app.getDevOpenid ? app.getDevOpenid() : ''
        if (devOpenid) payload.devOpenid = devOpenid
        return post(API_PATHS.WX_LOGIN, payload, {
          showLoading: true,
          loadingText: '登录中...',
          showError: false
        })
      }).then((data) => {
        if (data.needRegister) {
          wx.setStorageSync(STORAGE_KEYS.OPENID, data.openid)
          wx.removeStorageSync(STORAGE_KEYS.AGREEMENT_ACCEPTED)
          wx.redirectTo({ url: '/pages/agreement/agreement' })
          return
        }

        app.setLoginState(data.token, data.userInfo || data.user)

        wx.showToast({ title: '登录成功', icon: 'success' })

        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1000)
      })
    }).catch((err) => {
      const msg = (err && err.message) || '登录失败，请重试'
      wx.showModal({
        title: '登录失败',
        content: msg,
        showCancel: false
      })
      this.setData({ pageState: 'error', errorMsg: msg })
    }).then(() => {
      this.setData({ logging: false })
    })
  }
})
