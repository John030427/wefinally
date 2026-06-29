const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    count: 0
  },

  onLoad() {
    this.loadStat()
  },

  async loadStat() {
    this.setData({ pageState: 'loading' })
    const hasNetwork = await getApp().checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    try {
      const data = await get(API_PATHS.MARRY_STAT, {}, { showError: false })
      const count = (data && (data.count ?? data.marry_success_count)) || 0
      this.setData({ pageState: 'success', count })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  onRetry() {
    this.loadStat()
  }
})
