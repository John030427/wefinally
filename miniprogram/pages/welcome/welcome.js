Page({
  data: {
    pageState: 'success'
  },

  onLoad() {
    const app = getApp()
    if (app.globalData.isLoggedIn) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    wx.redirectTo({ url: '/pages/login/login' })
  }
})
