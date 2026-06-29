const { post } = require('../../utils/request')
const { API_PATHS, STORAGE_KEYS } = require('../../utils/constants')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    logging: false
  },

  onLoad() {
    this.checkNetworkAndInit()
  },

  async checkNetworkAndInit() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }
    if (app.globalData.isLoggedIn) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.setData({ pageState: 'success' })
  },

  onRetry() {
    this.checkNetworkAndInit()
  },

  async onWxLogin() {
    if (this.data.logging) return
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    this.setData({ logging: true })
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })

      if (!loginRes.code) {
        throw new Error('获取登录凭证失败')
      }

      const data = await post(API_PATHS.WX_LOGIN, { code: loginRes.code }, {
        showLoading: true,
        loadingText: '登录中...',
        showError: false
      })

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
    } catch (err) {
      const msg = (err && err.message) || '登录失败，请重试'
      wx.showModal({
        title: '登录失败',
        content: msg,
        showCancel: false
      })
      this.setData({ pageState: 'error', errorMsg: msg })
    } finally {
      this.setData({ logging: false })
    }
  }
})
