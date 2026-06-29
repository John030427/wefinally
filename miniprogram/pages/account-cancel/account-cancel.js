const { post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

Page({
  data: {
    submitting: false,
    confirmed: false
  },

  onCheckChange() {
    this.setData({ confirmed: !this.data.confirmed })
  },

  async onSubmit() {
    if (!this.data.confirmed) {
      wx.showToast({ title: '请先确认注销须知', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    wx.showModal({
      title: '最终确认',
      content: '账号注销后不可恢复，确定继续吗？',
      success: async (res) => {
        if (!res.confirm) return

        const hasNetwork = await getApp().checkNetwork()
        if (!hasNetwork) {
          wx.showToast({ title: '网络不可用', icon: 'none' })
          return
        }

        this.setData({ submitting: true })
        try {
          await post(API_PATHS.ACCOUNT_CANCEL, {}, { showLoading: true, loadingText: '提交中...' })
          getApp().clearLoginState()
          wx.showModal({
            title: '申请已提交',
            content: '注销申请已提交，请等待平台审核。',
            showCancel: false,
            success: () => wx.reLaunch({ url: '/pages/welcome/welcome' })
          })
        } catch (err) {
          wx.showModal({
            title: '提交失败',
            content: (err && err.message) || '请稍后重试',
            showCancel: false
          })
        } finally {
          this.setData({ submitting: false })
        }
      }
    })
  }
})
