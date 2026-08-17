const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const {
  formatDateOnly,
  genderText,
  calcAge,
  getCompatibilityColor,
  getCompatibilityDisplayText,
  getTotalMatchDisplayText,
  getCompatibilityTagClass
} = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    list: [],
    unreadCount: 0
  },

  onShow() {
    this.loadList()
    this.loadUnread()
  },

  async loadUnread() {
    try {
      const data = await get(API_PATHS.NOTIFICATIONS_UNREAD, {}, { showError: false })
      const unread = Math.max(0, Number((data && (data.unread_count || data.unreadCount)) || 0))
      this.setData({ unreadCount: unread })
      if (typeof wx !== 'undefined' && wx.showTabBarRedDot && wx.hideTabBarRedDot) {
        if (unread > 0) {
          try {
            wx.showTabBarRedDot({ index: 1 })
          } catch (err) { /* ignore */ }
          try {
            if (wx.setTabBarBadge) {
              wx.setTabBarBadge({ index: 1, text: unread > 99 ? '99+' : String(unread) })
            }
          } catch (err) { /* ignore */ }
        } else {
          try { wx.hideTabBarRedDot({ index: 1 }) } catch (err) { /* ignore */ }
          try { if (wx.removeTabBarBadge) wx.removeTabBarBadge({ index: 1 }) } catch (err) { /* ignore */ }
        }
      }
    } catch (err) { /* 未读数加载失败不阻断列表 */ }
  },

  goNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' })
  },

  async loadList() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    try {
      const data = await get(API_PATHS.MATCH_LIST, {}, { showError: false })
      const raw = (data && (data.list || data.items)) || (Array.isArray(data) ? data : [])
      const list = raw.map((item) => {
        const score = item.view_similarity !== null && item.view_similarity !== undefined
          ? item.view_similarity
          : item.compatibilityScore
        const totalScore = item.total_score !== null && item.total_score !== undefined
          ? item.total_score
          : item.totalScore
        const age = item.age || calcAge(item.birth_year)
        return {
          id: item.id || item.matchId,
          matchType: item.match_type || item.matchType || '',
          matchDate: formatDateOnly(item.match_date || item.matchDate),
          gender: genderText(item.gender),
          ageText: item.age_band || (age === '--' ? '--' : `${age}岁`),
          city: item.city || '--',
          totalScore: totalScore != null ? Math.round(Number(totalScore)) : null,
          totalScoreText: totalScore != null ? getTotalMatchDisplayText(totalScore) : '',
          score: score !== null && score !== undefined ? Number(score) : null,
          scoreText: score != null ? getCompatibilityDisplayText(score) : '',
          scoreColor: score != null ? getCompatibilityColor(score) : '',
          scoreTag: score != null ? getCompatibilityTagClass(score) : ''
        }
      })
      this.setData({
        pageState: list.length ? 'success' : 'empty',
        list
      })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  onRetry() {
    this.loadList()
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/match-detail/match-detail?id=${id}` })
  }
})
