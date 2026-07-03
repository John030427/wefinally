const { get } = require('../../utils/request')
const { API_PATHS, MATCH_SCHEDULE } = require('../../utils/constants')
const { formatDateOnly, getNextMatchTime, genderText, calcAge, getCompatibilityDisplayText } = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    isVip: false,
    vipExpireText: '',
    nextMatchText: '',
    scheduleDesc: MATCH_SCHEDULE.desc,
    latestMatch: null,
    hasLatest: false
  },

  onShow() {
    this.checkAuthAndLoad()
  },

  async checkAuthAndLoad() {
    const app = getApp()
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/welcome/welcome' })
      return
    }
    this.loadPage()
  },

  async loadPage() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    const next = getNextMatchTime()
    this.setData({ nextMatchText: next ? next.text : '每周三、周五 00:00' })

    try {
      const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      const latest = await get(API_PATHS.MATCH_LATEST, {}, { showError: false }).catch(() => null)

      const isVip = profile && (profile.isVip || profile.is_vip === 1)
      let latestMatch = null
      if (latest && (latest.id || latest.matchId)) {
        const age = latest.age || calcAge(latest.birth_year)
        latestMatch = {
          id: latest.id || latest.matchId,
          matchType: latest.match_type || latest.matchType || '',
          matchDate: formatDateOnly(latest.match_date || latest.matchDate),
          score: latest.view_similarity ?? latest.compatibilityScore ?? null,
          scoreText: getCompatibilityDisplayText(latest.view_similarity ?? latest.compatibilityScore ?? 0),
          gender: genderText(latest.gender),
          ageText: latest.age_band || (age === '--' ? '--' : `${age}岁`),
          city: latest.city || '--'
        }
      }

      this.setData({
        pageState: 'success',
        isVip,
        vipExpireText: profile && profile.vip_expire_time
          ? String(profile.vip_expire_time).slice(0, 10)
          : '',
        latestMatch,
        hasLatest: !!latestMatch
      })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  goMatchSetting() {
    wx.navigateTo({ url: '/pages/match-setting/match-setting' })
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/vip' })
  },

  goMatchList() {
    wx.switchTab({ url: '/pages/match-list/match-list' })
  },

  goMatchDetail() {
    const { latestMatch } = this.data
    if (!latestMatch || !latestMatch.id) return
    wx.navigateTo({ url: `/pages/match-detail/match-detail?id=${latestMatch.id}` })
  },

  goRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  }
})
