const { post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

Page({
  data: {
    pageState: 'success',
    submitting: false,
    reportType: 1,
    remark: ''
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  async onSubmit() {
    if (this.data.submitting) return

    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认提交',
      content: '提交结婚报备后，平台将审核。审核通过后账号永久注销并退出匹配池，此操作不可撤销。',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ submitting: true })
        try {
          await post(API_PATHS.MARRY_REPORT, {
            report_type: 1,
            remark: this.data.remark.trim()
          }, { showLoading: true, loadingText: '提交中...' })

          wx.showModal({
            title: '提交成功',
            content: '您的结婚报备已提交，请等待平台审核。',
            showCancel: false,
            success: () => wx.navigateBack()
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
