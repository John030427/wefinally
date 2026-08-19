const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { refreshNotificationBadge } = require('../../utils/notificationBadge')
const {
  formatDateOnly,
  genderText,
  calcAge,
  getCompatibilityColor,
  getCompatibilityDisplayText,
  getTotalMatchDisplayText,
  getCompatibilityTagClass
} = require('../../utils/util')

const QA_SCENARIOS = [
  { value: 'coordinate', label: 'AI协调' },
  { value: 'accept_direct', label: '直接接受' },
  { value: 'decline', label: '暂不方便' },
  { value: 'no_response', label: '不回应' },
  { value: 'accept_no_prefs', label: '接受未填偏好' },
  { value: 'manual_step', label: '手动推进' }
]

function buildRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    list: [],
    unreadCount: 0,
    qaTestRunEnabled: false,
    qaScenarioPickerVisible: false,
    qaScenario: 'coordinate',
    qaScenarios: QA_SCENARIOS,
    qaTestRunning: false,
    qaCountdown: 0,
    qaStatusText: ''
  },

  onShow() {
    this.loadQaAccess()
    this.loadList()
    this.loadUnread()
  },

  onHide() {
    this.clearQaTimers()
  },

  onUnload() {
    this.clearQaTimers()
  },

  clearQaTimers() {
    if (this._qaCountdownTimer) {
      clearInterval(this._qaCountdownTimer)
      this._qaCountdownTimer = null
    }
  },

  async loadQaAccess() {
    const app = getApp()
    let profile = app.globalData.userInfo
    if (!profile || profile.qa_test_run_enabled === undefined) {
      try {
        profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
        if (profile) {
          app.globalData.userInfo = profile
        }
      } catch (err) { /* QA flag optional */ }
    }
    const enabled = !!(profile && (profile.qa_test_run_enabled === true || profile.qa_test_run_enabled === 1))
    this.setData({ qaTestRunEnabled: enabled })
  },

  async loadUnread() {
    try {
      const unread = await refreshNotificationBadge()
      this.setData({ unreadCount: unread })
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
          scoreTag: score != null ? getCompatibilityTagClass(score) : '',
          testDataBadge: item.test_data_badge || ''
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
  },

  onQaToggleScenario() {
    if (!this.data.qaScenarioPickerVisible) {
      this.setData({ qaScenarioPickerVisible: true })
    }
  },

  onQaScenarioChange(e) {
    const value = e.detail.value
    if (value) {
      this.setData({ qaScenario: value })
    }
  },

  startQaCountdown(seconds) {
    this.clearQaTimers()
    return new Promise((resolve) => {
      let remaining = seconds
      this.setData({ qaCountdown: remaining })
      this._qaCountdownTimer = setInterval(() => {
        remaining -= 1
        if (remaining <= 0) {
          this.clearQaTimers()
          this.setData({ qaCountdown: 0 })
          resolve()
        } else {
          this.setData({ qaCountdown: remaining })
        }
      }, 1000)
    })
  },

  async pollUntilExecutable(runId, executeAfter) {
    const deadline = new Date(executeAfter).getTime()
    while (Date.now() < deadline) {
      await sleep(500)
      try {
        await get(`${API_PATHS.MATCH_TEST_RUNS}/${runId}`, {}, { showError: false })
      } catch (err) { /* keep polling until deadline */ }
    }
    return get(`${API_PATHS.MATCH_TEST_RUNS}/${runId}`, {}, { showError: false })
  },

  async onQaSimulateMatch() {
    if (!this.data.qaTestRunEnabled || this.data.qaTestRunning) return
    if (!this.data.qaScenarioPickerVisible) return

    this.setData({
      qaTestRunning: true,
      qaStatusText: '创建测试运行…'
    })

    try {
      const requestId = buildRequestId()
      const created = await post(API_PATHS.MATCH_TEST_RUNS, {
        request_id: requestId,
        fixture_journey: this.data.qaScenario
      }, { showLoading: false, showError: true })

      const runId = created && (created.id || created.run_id)
      const executeAfter = created && created.execute_after
      if (!runId || !executeAfter) {
        throw new Error('测试运行创建失败')
      }

      const waitMs = Math.max(0, new Date(executeAfter).getTime() - Date.now())
      const countdownSec = Math.max(1, Math.ceil(waitMs / 1000))
      this.setData({ qaStatusText: '模拟匹配倒计时…' })
      await this.startQaCountdown(countdownSec)

      this.setData({ qaStatusText: '等待执行窗口…' })
      await this.pollUntilExecutable(runId, executeAfter)

      this.setData({ qaStatusText: '执行测试匹配…' })
      const executed = await post(`${API_PATHS.MATCH_TEST_RUN_EXECUTE}/${runId}/execute`, {}, {
        showLoading: false,
        showError: true
      })

      const status = executed && executed.status
      const message = (executed && executed.message) || ''
      if (status === 'completed_matched') {
        wx.showToast({ title: '测试匹配成功', icon: 'success' })
        this.setData({ qaStatusText: message || '测试匹配成功' })
        await this.loadList()
      } else if (status === 'completed_no_match') {
        wx.showToast({ title: '本轮无匹配', icon: 'none' })
        this.setData({ qaStatusText: message || '本轮无匹配结果' })
        await this.loadList()
      } else if (status === 'blocked' || status === 'failed') {
        wx.showToast({ title: message || '测试匹配未成功', icon: 'none' })
        this.setData({ qaStatusText: message || '测试匹配未成功' })
      } else {
        this.setData({ qaStatusText: message || '测试运行已提交' })
      }
    } catch (err) {
      this.setData({
        qaStatusText: (err && err.message) || '测试匹配失败'
      })
    } finally {
      this.setData({
        qaTestRunning: false,
        qaCountdown: 0
      })
    }
  }
})
