const { STORAGE_KEYS } = require('./utils/constants')

App({
  globalData: {
    API_BASE_URL: 'https://api.wefinally.com',
    userInfo: null,
    token: '',
    isLoggedIn: false,
    networkAvailable: true,
    launchScene: '',
    launchQuery: {}
  },

  onLaunch(options) {
    this.initNetworkListener()
    this.restoreSession()
    if (options.scene) this.globalData.launchScene = options.scene
    if (options.query) this.globalData.launchQuery = options.query
  },

  initNetworkListener() {
    wx.onNetworkStatusChange((res) => {
      this.globalData.networkAvailable = res.isConnected
    })
    wx.getNetworkType({
      success: (res) => {
        this.globalData.networkAvailable = res.networkType !== 'none'
      }
    })
  },

  restoreSession() {
    const token = wx.getStorageSync(STORAGE_KEYS.TOKEN)
    const userInfo = wx.getStorageSync(STORAGE_KEYS.USER_INFO)
    if (token) {
      this.globalData.token = token
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = userInfo || null
    }
  },

  setLoginState(token, userInfo) {
    this.globalData.token = token
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = true
    wx.setStorageSync(STORAGE_KEYS.TOKEN, token)
    wx.setStorageSync(STORAGE_KEYS.USER_INFO, userInfo)
  },

  clearLoginState() {
    this.globalData.token = ''
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    wx.removeStorageSync(STORAGE_KEYS.TOKEN)
    wx.removeStorageSync(STORAGE_KEYS.USER_INFO)
  },

  checkNetwork() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          const available = res.networkType !== 'none'
          this.globalData.networkAvailable = available
          resolve(available)
        },
        fail: () => resolve(false)
      })
    })
  }
})
