Page({
  data: {
    pageState: 'success'
  },

  onLoad() {
    const app = getApp()
    if (app.globalData.isLoggedIn) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  goRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  }
})
