const { get, post } = require('../../utils/request')
const { API_PATHS, MATCH_SCHEDULE, GUANGDONG_110_DEFAULT } = require('../../utils/constants')
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
    hasLatest: false,
    devMatchStartEnabled: false,
    devMatchStarting: false
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
    const apiBase = (app.globalData && app.globalData.API_BASE_URL) || ''
    const localApi = /\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(apiBase)
    this.setData({
      nextMatchText: next ? next.text : '每周三、周五 00:00',
      devMatchStartEnabled: Boolean(app.globalData.DEV_MATCH_BUTTON_ENABLED || localApi)
    })

    try {
      const commonConfig = await get(API_PATHS.COMMON_CONFIG, {}, { showError: false }).catch(() => null)
      const demoFlags = commonConfig && commonConfig.demo ? commonConfig.demo : {}
      const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      const latest = await get(API_PATHS.MATCH_LATEST, {}, { showError: false }).catch(() => null)

      const isVip = profile && (profile.isVip || profile.is_vip === 1)
      let latestMatch = null
      if (latest && (latest.id || latest.matchId)) {
        const age = latest.age || calcAge(latest.birth_year)
        const score = latest.view_similarity !== null && latest.view_similarity !== undefined
          ? latest.view_similarity
          : (latest.compatibilityScore !== null && latest.compatibilityScore !== undefined ? latest.compatibilityScore : null)
        latestMatch = {
          id: latest.id || latest.matchId,
          matchType: latest.match_type || latest.matchType || '',
          matchDate: formatDateOnly(latest.match_date || latest.matchDate),
          score,
          scoreText: getCompatibilityDisplayText(score !== null && score !== undefined ? score : 0),
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
        hasLatest: !!latestMatch,
        devMatchStartEnabled: Boolean(app.globalData.DEV_MATCH_BUTTON_ENABLED || localApi || demoFlags.matchStartEnabled)
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
  },

  goMeetSafety() {
    wx.navigateTo({ url: '/pages/meet-safety-list/meet-safety-list' })
  },

  async devStartMatch() {
    if (this.data.devMatchStarting) return
    this.setData({ devMatchStarting: true })
    try {
      const result = await post(API_PATHS.MATCH_START, {
        allow_rematch: false,
        allow_quality_fallback: true,
        reset_user_batch: true,
        dev_seed_current_user_candidates: true
      }, { showLoading: true, loadingText: '正在匹配...' })
      const matched = result.matched || 0
      if (matched > 0 && result.match_id) {
        wx.showToast({ title: '匹配完成，生成报告中', icon: 'none' })
        wx.navigateTo({ url: `/pages/match-detail/match-detail?id=${result.match_id}&autoReport=1` })
      } else {
        wx.showToast({ title: '暂无可用候选', icon: 'none' })
        this.loadPage()
      }
    } catch (err) {
      wx.showModal({
        title: '测试匹配未开启',
        content: (err && err.message) || '后端需设置 DEV_MATCH_START_ENABLED=true 后重启',
        showCancel: false
      })
    } finally {
      this.setData({ devMatchStarting: false })
    }
  },

  devResetRegistration() {
    const app = getApp()
    const openid = `uat_register_${Date.now()}`
    if (!app.resetLocalForRegistration) {
      wx.showModal({ title: '当前版本不支持', content: '请在 Console 使用 getApp().resetLocalForRegistration()', showCancel: false })
      return
    }
    const result = app.resetLocalForRegistration(openid)
    if (result && result.ok === false) {
      wx.showModal({ title: '重置失败', content: result.message || '请稍后重试', showCancel: false })
    }
  },

  getLocationForSos() {
    return new Promise((resolve) => {
      if (!wx.getLocation) {
        resolve({})
        return
      }
      wx.getLocation({
        type: 'gcj02',
        success: (r) => resolve({ lat: r.latitude, lng: r.longitude }),
        fail: () => resolve({})
      })
    })
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
      const loc = location || await this.getLocationForSos()
      await post(API_PATHS.MEET_SOS, loc, { showError: false })
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
