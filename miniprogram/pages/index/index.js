const { get, post } = require('../../utils/request')
const { API_PATHS, MATCH_SCHEDULE, GUANGDONG_110_DEFAULT } = require('../../utils/constants')
const { formatDateOnly, getNextMatchTime, genderText, calcAge, getCompatibilityDisplayText } = require('../../utils/util')
const { buildProfileReadiness, buildJourneyState } = require('../../utils/productExperience')
const { seenStorageKey, shouldRevealLatestMatch } = require('../../utils/matchResultReveal')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    isVip: false,
    vipExpireText: '',
    nextMatchText: '',
    scheduleDesc: MATCH_SCHEDULE.desc,
    latestMatch: null,
    hasLatest: false,
    readiness: null,
    journeyState: null,
    matchRevealVisible: false,
    matchRevealStorageKey: ''
  },

  onShow() {
    this.checkAuthAndLoad()
  },

  async checkAuthAndLoad() {
    const app = getApp()
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' })
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
    this.setData({
      nextMatchText: next ? next.text : '每周三、周五 00:00'
    })

    try {
      const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      const latest = await get(API_PATHS.MATCH_LATEST, {}, { showError: false }).catch(() => null)

      const isVip = profile && (profile.isVip || profile.is_vip === 1)
      const latestMatch = this.normalizeLatestMatch(latest)
      const matchRevealStorageKey = seenStorageKey(profile)
      const seenMatchId = matchRevealStorageKey ? wx.getStorageSync(matchRevealStorageKey) : ''
      const matchRevealVisible = shouldRevealLatestMatch({
        latest: latestMatch,
        seenMatchId,
        now: new Date()
      })

      const readiness = buildProfileReadiness(profile)
      const journeyState = buildJourneyState({
        readiness,
        memberStatus: profile.member_status || '',
        isVip,
        latestMatch,
        nextMatchText: next ? next.text : ''
      })
      this.setData({
        pageState: 'success',
        isVip,
        vipExpireText: profile && profile.vip_expire_time
          ? String(profile.vip_expire_time).slice(0, 10)
          : '',
        latestMatch,
        hasLatest: !!latestMatch,
        readiness,
        journeyState,
        matchRevealVisible,
        matchRevealStorageKey
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

  normalizeLatestMatch(latest) {
    if (!latest || (!latest.id && !latest.matchId)) return null
    const age = latest.age || calcAge(latest.birth_year)
    const score = latest.view_similarity !== null && latest.view_similarity !== undefined
      ? latest.view_similarity
      : (latest.compatibilityScore !== null && latest.compatibilityScore !== undefined ? latest.compatibilityScore : null)
    return {
      id: latest.id || latest.matchId,
      matchType: latest.match_type || latest.matchType || '',
      matchDate: formatDateOnly(latest.match_date || latest.matchDate),
      score,
      scoreText: getCompatibilityDisplayText(score !== null && score !== undefined ? score : 0),
      gender: genderText(latest.gender),
      ageText: latest.age_band || (age === '--' ? '--' : `${age}岁`),
      city: latest.city || '--'
    }
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

  markLatestMatchSeen() {
    const { latestMatch, matchRevealStorageKey } = this.data
    if (latestMatch && latestMatch.id && matchRevealStorageKey) {
      wx.setStorageSync(matchRevealStorageKey, String(latestMatch.id))
    }
    this.setData({ matchRevealVisible: false })
  },

  onMatchRevealView() {
    this.markLatestMatchSeen()
    this.goMatchDetail()
  },

  onMatchRevealDismiss() {
    this.markLatestMatchSeen()
  },

  goRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  },

  goMeetSafety() {
    wx.navigateTo({ url: '/pages/meet-safety-list/meet-safety-list' })
  },

  onJourneyAction() {
    const state = this.data.journeyState
    if (!state || !state.url) return
    wx.navigateTo({ url: state.url })
  },

  onQaMatchCompleted() {
    this.loadPage()
  },

  goLoveAdvisor() {
    wx.navigateTo({ url: '/pages/love-advisor/love-advisor' })
  },

  callPolice() {
    this.openEmergencyHelp({ location: {} })
    this.recordHomeSos()
  },

  buildEmergencyHelp(safety = {}) {
    const gd110 = safety.guangdong110 || {}
    return {
      location: safety.location || {},
      guangdong110: {
        enabled: gd110.enabled !== false,
        appId: gd110.appId || GUANGDONG_110_DEFAULT.appId,
        path: gd110.path || GUANGDONG_110_DEFAULT.path
      }
    }
  },

  openEmergencyHelp(safety = {}) {
    const config = this.buildEmergencyHelp(safety)
    const gd110 = config.guangdong110
    if (gd110.enabled && gd110.appId) {
      this.openGuangdong110MiniProgram(gd110, config.location)
      return
    }

    this.showGuangdong110Fail({ errMsg: '广东110 appId 未配置' })
  },

  buildGuangdong110ExtraData(location = {}) {
    const data = { source: 'wefinally' }
    if (location.lat !== undefined && location.lat !== null) data.lat = location.lat
    if (location.lng !== undefined && location.lng !== null) data.lng = location.lng
    return data
  },

  openGuangdong110MiniProgram(gd110, location) {
    const options = {
      appId: gd110.appId,
      extraData: this.buildGuangdong110ExtraData(location),
      fail: (err) => this.showGuangdong110Fail(err)
    }
    if (gd110.path) options.path = gd110.path
    if (typeof wx.navigateToMiniProgram !== 'function') {
      this.showGuangdong110Fail({ errMsg: 'navigateToMiniProgram unavailable' })
      return
    }
    try {
      wx.navigateToMiniProgram(options)
    } catch (err) {
      this.showGuangdong110Fail(err)
    }
  },

  async recordHomeSos(location) {
    try {
      await post(API_PATHS.MEET_SOS, location || {}, { showError: false })
    } catch (err) {}
  },

  showGuangdong110Fail(err) {
    const msg = err && err.errMsg ? err.errMsg : '未知错误'
    wx.showModal({
      title: '广东110打开失败',
      content: `未能自动打开广东110小程序。\n\n微信错误：${msg}\n\n请在微信搜索“广东110”进入官方报警小程序。`,
      confirmText: '复制名称',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm && wx.setClipboardData) {
          wx.setClipboardData({ data: '广东110' })
        }
      }
    })
  }
})
