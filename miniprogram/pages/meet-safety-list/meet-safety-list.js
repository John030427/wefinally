const { get } = require('../../utils/request')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    list: []
  },

  onShow() {
    this.loadList()
  },

  async loadList() {
    this.setData({ pageState: 'loading' })
    try {
      const rows = await get('/api/meet/list', {}, { showError: false })
      const list = (rows || []).map((r) => ({
        ...r,
        statusText: r.status === 2 ? '已取消' : (r.status === 1 ? '已结束' : '进行中')
      }))
      this.setData({ pageState: list.length ? 'success' : 'empty', list })
    } catch (e) {
      this.setData({ pageState: 'error', errorMsg: (e && e.message) || '加载失败' })
    }
  },

  onRetry() {
    this.loadList()
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/meet-safety/meet-safety?id=${e.currentTarget.dataset.id}` })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/meet-safety/meet-safety?mode=create' })
  }
})
