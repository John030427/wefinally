const { get, post } = require('../../utils/request')
const { API_PATHS, MATCH_SCHEDULE, GUANGDONG_110_DEFAULT } = require('../../utils/constants')
const { formatDateOnly, getNextMatchTime, genderText, calcAge, getCompatibilityDisplayText } = require('../../utils/util')
const { buildProfileReadiness, buildJourneyState } = require('../../utils/productExperience')

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
    qaTestRunEnabled: false,
    testRunBusy: false,
    testRunStatus: '',
    testRunStatusText: '',
    testRunId: 0,
    testRunMatchId: 0,
    countdownLeft: 0,
    readiness: null,
    journeyState: null
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

      const readiness = buildProfileReadiness(profile)
      const journeyState = buildJourneyState({
        readiness,
        memberStatus: profile.member_status || '',
        isVip,
        latestMatch,
        nextMatchText: next ? next.text : ''
      })
      const qaTestRunEnabled = profile && (profile.qa_test_run_enabled === true || profile.account_mode === 'internal_qa')
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
        qaTestRunEnabled
      })
      if (qaTestRunEnabled) await this.restoreQaTestRun()
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

  onJourneyAction() {
    const state = this.data.journeyState
    if (!state || !state.url) return
    wx.navigateTo({ url: state.url })
  },

  goLoveAdvisor() {
    wx.navigateTo({ url: '/pages/love-advisor/love-advisor' })
  },

  testRunLabel(run) {
    const status = run && run.status || this.data.testRunStatus
    const messages = {
      queued: this.data.countdownLeft > 0 ? `倒计时 ${this.data.countdownLeft} 秒` : '已创建，等待倒计时结束',
      countdown: `倒计时 ${this.data.countdownLeft} 秒`,
      running: '正在执行测试匹配',
      completed_matched: '测试匹配成功，可进入详情',
      matched: '测试匹配成功，可进入详情',
      completed_no_match: run && run.message || '本轮无匹配结果',
      no_match: '本轮无匹配结果',
      blocked: run && run.message || '当前无法测试匹配',
      failed: '测试运行失败，可安全重试'
    }
    return messages[status] || ''
  },

  applyTestRun(run, extra = {}) {
    if (!run) return
    const status = run.status === 'completed_matched' ? 'matched' : (run.status === 'completed_no_match' ? 'no_match' : run.status)
    this.setData(Object.assign({
      testRunId: run.id || run.run_id || 0,
      testRunStatus: status,
      testRunMatchId: run.match_id || 0,
      testRunBusy: status === 'queued' || status === 'countdown' || status === 'running',
      testRunStatusText: this.testRunLabel(Object.assign({}, run, { status }))
    }, extra))
    if (run.id || run.run_id) wx.setStorageSync('wf_test_run_id', run.id || run.run_id)
  },

  async restoreQaTestRun() {
    const storedId = wx.getStorageSync('wf_test_run_id')
    try {
      const run = storedId
        ? await get(`${API_PATHS.MATCH_TEST_RUNS}/${storedId}`, {}, { showError: false })
        : await get(API_PATHS.MATCH_TEST_RUNS, { latest: 1 }, { showError: false })
      if (run && run.id) {
        this.applyTestRun(run)
        if (run.status === 'queued') this.resumeCountdown(run)
      }
    } catch (err) {}
  },

  resumeCountdown(run) {
    const remainMs = new Date(run.execute_after || 0).getTime() - Date.now()
    if (remainMs <= 0) {
      this.executeQaTestRun()
      return
    }
    this.setData({ countdownLeft: Math.ceil(remainMs / 1000), testRunBusy: true, testRunStatus: 'countdown' })
    this.tickCountdown()
  },

  tickCountdown() {
    if (this._testRunTimer) clearInterval(this._testRunTimer)
    this._testRunTimer = setInterval(() => {
      const left = Number(this.data.countdownLeft || 0) - 1
      if (left <= 0) {
        clearInterval(this._testRunTimer)
        this._testRunTimer = null
        this.setData({ countdownLeft: 0 })
        this.executeQaTestRun()
        return
      }
      this.setData({
        countdownLeft: left,
        testRunStatusText: `倒计时 ${left} 秒`
      })
    }, 1000)
  },

  clearTestRunTimer() {
    if (!this._testRunTimer) return
    clearInterval(this._testRunTimer)
    this._testRunTimer = null
  },

  onHide() {
    this.clearTestRunTimer()
  },

  onUnload() {
    this.clearTestRunTimer()
  },

  async startQaTestRun() {
    if (this.data.testRunBusy) return
    this.setData({ testRunBusy: true, testRunStatus: 'countdown', countdownLeft: 10, testRunStatusText: '倒计时 10 秒' })
    try {
      const requestId = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const run = await post(API_PATHS.MATCH_TEST_RUNS, { request_id: requestId }, { showError: false })
      this.applyTestRun(run, { countdownLeft: 10, testRunStatus: 'countdown', testRunBusy: true, testRunStatusText: '倒计时 10 秒' })
      this.tickCountdown()
    } catch (err) {
      this.setData({
        testRunBusy: false,
        testRunStatus: 'failed',
        testRunStatusText: (err && err.message) || '测试运行失败，可安全重试'
      })
    }
  },

  async executeQaTestRun() {
    const id = this.data.testRunId
    if (!id) {
      this.setData({ testRunBusy: false })
      return
    }
    this.setData({ testRunStatus: 'running', testRunStatusText: '正在执行测试匹配', testRunBusy: true })
    try {
      const run = await post(`${API_PATHS.MATCH_TEST_RUNS}/${id}/execute`, {}, { showError: false })
      this.applyTestRun(run, { testRunBusy: run.status === 'queued', countdownLeft: 0 })
      if (run.status === 'queued') this.resumeCountdown(run)
    } catch (err) {
      this.setData({
        testRunBusy: false,
        testRunStatus: 'failed',
        testRunStatusText: (err && err.message) || '测试运行失败，可安全重试'
      })
    }
  },

  onTestRunAction() {
    if (this.data.testRunStatus === 'matched' || this.data.testRunStatus === 'completed_matched') {
      this.goTestMatchDetail()
      return
    }
    if (this.data.testRunStatus === 'failed') this.executeQaTestRun()
  },

  goTestMatchDetail() {
    if (!this.data.testRunMatchId) return
    wx.navigateTo({ url: `/pages/match-detail/match-detail?id=${this.data.testRunMatchId}&autoReport=1` })
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
