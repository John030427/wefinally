const { get, post, put } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

function dateText(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeCoordination(data) {
  const coordination = data && (data.coordination || data)
  return coordination || {}
}

function buildCoordinationDisplay(coordination) {
  const status = String(coordination && coordination.status || '')
  const processingStatus = String(coordination && coordination.processing_status || '')
  const roundNumber = Math.max(1, Math.min(Number(coordination && coordination.round_number || 1), Number(coordination && coordination.max_rounds || 5)))
  const maxRounds = Math.max(roundNumber, Number(coordination && coordination.max_rounds || 5))
  const labels = {
    collecting_initiator: '等待发起方填写',
    inviting_partner: '等待对方接受邀请',
    collecting_preferences: '等待双方填写',
    computing_overlap: processingStatus === 'processing' ? '处理中' : (processingStatus === 'failed' ? '处理失败' : '待处理'),
    waiting_confirmations: '等待双方确认',
    no_overlap: '本轮暂无交集',
    replanning: '请和AI协调员沟通',
    arranged: '双方已确认',
    invitation_declined: '邀请未被接受',
    manual_handoff: '已转人工协助',
    expired: '已过期',
    cancelled: '已结束'
  }
  const activeCoordinatorStatuses = new Set([
    'inviting_partner',
    'collecting_preferences',
    'computing_overlap',
    'waiting_confirmations',
    'no_overlap',
    'replanning'
  ])
  return {
    roundNumber,
    maxRounds,
    version: Math.max(1, Number(coordination && coordination.coordination_version || 1)),
    statusText: labels[status] || '协调中',
    processing: status === 'computing_overlap' && ['queued', 'processing'].includes(processingStatus),
    queued: status === 'computing_overlap' && processingStatus === 'queued',
    failed: status === 'computing_overlap' && processingStatus === 'failed',
    manualHandoff: status === 'manual_handoff',
    completed: status === 'arranged',
    shouldPoll: status === 'computing_overlap' && ['queued', 'processing'].includes(processingStatus),
    showCoordinatorCta: activeCoordinatorStatuses.has(status),
    coordinatorHeroText: status === 'no_overlap'
      ? '目前还没有找到完整共同安排。你可以随时和 AI 协调员沟通，调整条件后再计算。'
      : (status === 'waiting_confirmations'
        ? '已有推荐方案待确认。你也可以继续和 AI 协调员沟通微调。'
        : '正在寻找双方共同安排。你可以随时和 AI 约会协调员沟通。')
  }
}

function buildSelection(form) {
  const activities = {}
  const periods = {}
  ;(form.activities || []).forEach((value) => { activities[value] = true })
  ;(form.availability || []).forEach((item) => {
    periods[item.date] = {}
    ;(item.periods || []).forEach((value) => { periods[item.date][value] = true })
  })
  return { activities, periods }
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    coordinationId: '',
    coordination: null,
    coordinationDisplay: buildCoordinationDisplay({}),
    showCoordinatorCta: false,
    coordinatorHeroText: '正在寻找双方共同安排。你可以随时和 AI 约会协调员沟通。',
    refreshingCoordination: false,
    fixtureSimulation: null,
    fixtureStage: '',
    fixtureStatusText: '',
    fixtureResponseMessage: '',
    refreshingFixture: false,
    dateMin: '',
    dateMax: '',
    selectedDate: '',
    areaText: '',
    form: {
      availability: [],
      areas: [],
      activities: [],
      budget: '',
      payment_preference: '',
      duration: '',
      transport_constraints: '',
      other_requirements: '',
      share_message: ''
    },
    selection: {
      activities: {},
      periods: {}
    },
    periodOptions: [
      { value: 'morning', label: '🌤 上午' },
      { value: 'afternoon', label: '☀️ 午后' },
      { value: 'evening', label: '🌇 傍晚' },
      { value: 'night', label: '🌙 晚上' }
    ],
    activityOptions: [
      { value: '咖啡', label: '☕ 咖啡' },
      { value: '吃饭', label: '🍽 吃饭' },
      { value: '奶茶', label: '🧋 奶茶' },
      { value: '散步', label: '🚶 散步' },
      { value: '看展', label: '🖼 看展' },
      { value: '电影', label: '🎬 电影' },
      { value: '桌游', label: '🎲 桌游' }
    ],
    budgetOptions: [
      { value: 'under-50', label: '💵 50元以内' },
      { value: '50-100', label: '💰 50-100元' },
      { value: '100-200', label: '💳 100-200元' },
      { value: 'over-200', label: '✨ 200元以上' },
      { value: 'flexible', label: '🌈 灵活' }
    ],
    paymentOptions: [
      { value: 'aa', label: '🤝 接受AA' },
      { value: 'partner_pays', label: '🎁 希望对方请客' },
      { value: 'self_pays', label: '🙋 我愿意请客' },
      { value: 'flexible', label: '🌈 都可以' }
    ],
    durationOptions: [
      { value: 'about-1h', label: '⏱ 1小时左右' },
      { value: '1-2h', label: '🕐 1-2小时' },
      { value: '2-3h', label: '🕑 2-3小时' },
      { value: 'flexible', label: '🌈 灵活' }
    ],
    proposal: null,
    submitting: false,
    responding: false
  },

  onLoad(options) {
    this.launchOptions = Object.assign({}, options)
    const today = new Date()
    const min = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    const max = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    this.setData({ dateMin: dateText(min), dateMax: dateText(max) })
    this.openCoordination(options)
  },

  onShow() {
    this.pageVisible = true
    if (this.hasShown && this.data.fixtureSimulation) {
      this.refreshFixtureSimulation()
      this.hasShown = true
      return
    }
    if (this.hasShown && this.data.coordinationId && this.data.pageState === 'success') {
      this.refreshCoordination()
    }
    this.hasShown = true
  },

  onHide() {
    this.pageVisible = false
    this.stopFixturePolling()
    this.stopCoordinationPolling()
  },

  onUnload() {
    this.pageVisible = false
    this.stopFixturePolling()
    this.stopCoordinationPolling()
  },

  async openCoordination(options) {
    options = options || {}
    this.setData({ pageState: 'loading', errorMsg: '' })
    const app = getApp()
    if (!await app.checkNetwork()) {
      this.setData({ pageState: 'no-network' })
      return
    }
    try {
      let coordination
      const explicitId = options.coordinationId || options.id
      if (explicitId) {
        coordination = normalizeCoordination(await get(`${API_PATHS.DATE_COORDINATIONS}/${explicitId}`, {}, { showError: false }))
      } else {
        coordination = normalizeCoordination(await post(API_PATHS.DATE_COORDINATIONS, {
          match_user_id: Number(options.matchUserId || 0),
          match_log_id: Number(options.matchLogId || 0)
        }, { showError: false }))
        const id = coordination.id || coordination.coordination_id || coordination.coordinationId
        if (id) coordination = normalizeCoordination(await get(`${API_PATHS.DATE_COORDINATIONS}/${id}`, {}, { showError: false }).catch(() => coordination))
      }
      this.applyCoordination(coordination)
    } catch (err) {
      this.setData({ pageState: 'error', errorMsg: (err && err.message) || '加载失败，请重试' })
    }
  },

  applyCoordination(coordination) {
    if (coordination.test_simulation && coordination.fixture_response_job) {
      this.applyFixtureSimulation(coordination)
      return
    }
    if (coordination.test_simulation && coordination.await_application) {
      this.fixtureDraft = {
        match_log_id: Number(coordination.match_log_id || 0),
        match_user_id: Number(coordination.match_user_id || 0)
      }
      this.setData({
        pageState: 'success',
        coordination: Object.assign({}, coordination, {
          status: 'collecting_initiator',
          role: 'initiator',
          can_submit_application: true,
          simulation_badge: '虚拟体验对象'
        }),
        coordinationId: '',
        fixtureSimulation: null,
        fixtureStage: '',
        fixtureStatusText: '请完整填写约会偏好后提交'
      })
      return
    }
    const status = String(coordination.status || '')
    const id = coordination.id || coordination.coordination_id || coordination.coordinationId || ''
    const application = coordination.application || coordination.my_application || {}
    const proposal = coordination.final_proposal || coordination.proposal || (coordination.proposals || [])[0] || null
    const coordinationDisplay = buildCoordinationDisplay(coordination)
    const form = Object.assign({}, this.data.form, application, {
      availability: application.availability || this.data.form.availability || [],
      activities: application.activities || this.data.form.activities || []
    })
    this.setData({
      coordinationId: String(id),
      coordination,
      coordinationDisplay,
      showCoordinatorCta: Boolean(id) && Boolean(coordinationDisplay.showCoordinatorCta),
      coordinatorHeroText: coordinationDisplay.coordinatorHeroText,
      form,
      selection: buildSelection(form),
      areaText: Array.isArray(form.areas) ? form.areas.join('、') : '',
      proposal,
      pageState: status === 'expired' ? 'expired' : 'success'
    })
    if (coordinationDisplay.shouldPoll && this.pageVisible !== false) this.startCoordinationPolling()
    else this.stopCoordinationPolling()
  },

  applyFixtureSimulation(result) {
    const job = result.fixture_response_job || {}
    const fixtureStage = job.status === 'delivered'
      ? 'completed'
      : (job.status === 'processing' ? 'generating' : 'queued')
    const statusText = fixtureStage === 'completed'
      ? 'AI协调已完成，对方未接受本次约会申请'
      : (fixtureStage === 'generating' ? 'AI协调员正在整理协调结果' : '约会申请已收到，AI协调任务正在排队')
    this.setData({
      pageState: 'fixture-simulation',
      fixtureSimulation: job,
      fixtureStage,
      fixtureStatusText: statusText,
      fixtureResponseMessage: result.response_message || ''
    })
    if (fixtureStage === 'completed') this.stopFixturePolling()
    else if (this.pageVisible !== false) this.startFixturePolling()
  },

  startFixturePolling() {
    this.stopFixturePolling()
    this.fixturePollTimer = setInterval(() => {
      this.refreshFixtureSimulation(true)
    }, 10000)
  },

  stopFixturePolling() {
    if (!this.fixturePollTimer) return
    clearInterval(this.fixturePollTimer)
    this.fixturePollTimer = null
  },

  async refreshFixtureSimulation(silent) {
    const isSilent = silent === true
    const job = this.data.fixtureSimulation
    if (!job || !job.id || this.data.refreshingFixture) return
    this.setData({ refreshingFixture: true })
    try {
      const result = await get(`${API_PATHS.DATE_COORDINATIONS}/fixture-responses/${job.id}`, {}, { showError: false })
      this.applyFixtureSimulation(result)
    } catch (err) {
      if (!isSilent) wx.showToast({ title: (err && err.message) || '刷新失败', icon: 'none' })
    } finally {
      this.setData({ refreshingFixture: false })
    }
  },

  onRetry() {
    this.openCoordination(this.data.coordinationId
      ? { coordinationId: this.data.coordinationId }
      : (this.launchOptions || {}))
  },

  startCoordinationPolling() {
    this.stopCoordinationPolling()
    this.coordinationPollTimer = setInterval(() => this.refreshCoordination(true), 6000)
  },

  stopCoordinationPolling() {
    if (!this.coordinationPollTimer) return
    clearInterval(this.coordinationPollTimer)
    this.coordinationPollTimer = null
  },

  async refreshCoordination(silent) {
    if (!this.data.coordinationId || this.data.refreshingCoordination) return
    const isSilent = silent === true
    this.setData({ refreshingCoordination: true })
    try {
      const result = await get(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}`, {}, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
    } catch (err) {
      if (!isSilent) wx.showToast({ title: (err && err.message) || '刷新失败', icon: 'none' })
    } finally {
      this.setData({ refreshingCoordination: false })
    }
  },

  onDateChange(e) {
    const value = e.detail.value
    const availability = this.data.form.availability || []
    if (availability.some((item) => item.date === value)) return
    const nextAvailability = [...availability, { date: value, periods: ['afternoon'] }].slice(0, 5)
    const nextForm = Object.assign({}, this.data.form, { availability: nextAvailability })
    this.setData({
      selectedDate: value,
      'form.availability': nextAvailability,
      selection: buildSelection(nextForm)
    })
  },

  removeAvailability(e) {
    const value = e.currentTarget.dataset.value
    const availability = (this.data.form.availability || []).filter((item) => item.date !== value)
    this.setData({
      'form.availability': availability,
      selection: buildSelection(Object.assign({}, this.data.form, { availability }))
    })
  },

  togglePeriod(e) {
    const date = e.currentTarget.dataset.date
    const period = e.currentTarget.dataset.period
    const availability = (this.data.form.availability || []).map((item) => {
      if (item.date !== date) return item
      const periods = item.periods || []
      if (periods.includes(period) && periods.length === 1) {
        wx.showToast({ title: '每个日期至少保留一个时间段', icon: 'none' })
        return item
      }
      return {
        ...item,
        periods: periods.includes(period) ? periods.filter((value) => value !== period) : [...periods, period]
      }
    })
    this.setData({
      'form.availability': availability,
      selection: buildSelection(Object.assign({}, this.data.form, { availability }))
    })
  },

  toggleActivity(e) {
    const value = e.currentTarget.dataset.value
    const activities = this.data.form.activities || []
    const next = activities.includes(value)
      ? activities.filter((item) => item !== value)
      : [...activities, value].slice(0, 3)
    if (!activities.includes(value) && activities.length >= 3) {
      wx.showToast({ title: '活动最多3项', icon: 'none' })
      return
    }
    this.setData({
      'form.activities': next,
      selection: buildSelection(Object.assign({}, this.data.form, { activities: next }))
    })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value })
  },

  onAreasInput(e) {
    const areaText = e.detail.value
    const areas = areaText.split(/[、,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 6)
    this.setData({ areaText, 'form.areas': areas })
  },

  selectOption(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.currentTarget.dataset.value })
  },

  async respondInvitation(e) {
    if (this.data.responding) return
    const decision = e.currentTarget.dataset.accepted === 'true' ? 'accept' : 'decline'
    this.setData({ responding: true })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/invitation-response`, {
        decision
      }, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败，请重试', icon: 'none' })
    } finally {
      this.setData({ responding: false })
    }
  },

  async submitApplication() {
    if (this.data.submitting) return
    if (!this.data.form.availability.length || !this.data.form.areas.length || !this.data.form.activities.length ||
      !this.data.form.budget || !this.data.form.payment_preference || !this.data.form.duration) {
      wx.showToast({ title: '请补充可约时间、区域和活动', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    const wasInitiatorDraft = this.data.coordination && this.data.coordination.status === 'collecting_initiator'
    try {
      if (this.fixtureDraft && this.data.coordination && this.data.coordination.test_simulation) {
        const result = await post(`${API_PATHS.DATE_COORDINATIONS}/fixture-applications`, {
          match_log_id: this.fixtureDraft.match_log_id,
          match_user_id: this.fixtureDraft.match_user_id,
          application: this.data.form
        }, { showError: false })
        this.applyFixtureSimulation(result)
        wx.showToast({ title: '约会申请已提交', icon: 'success' })
        return
      }
      const result = await put(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/application`, this.data.form, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      wx.showToast({
        title: wasInitiatorDraft ? '已保存偏好，正在邀请对方' : '已提交约会偏好',
        icon: 'success'
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async confirmProposal() {
    return this.respondToProposal('confirm')
  },

  async rejectProposal() {
    return this.respondToProposal('reject')
  },

  async respondToProposal(decision) {
    if (!this.data.proposal || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const proposalId = this.data.proposal.id || this.data.proposal.proposal_id
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/proposals/${proposalId}/confirm`, {
        coordination_version: this.data.coordination.coordination_version,
        decision
      }, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      if (decision === 'reject') this.goCoordinator()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || (decision === 'reject' ? '暂时无法继续协调' : '确认失败，请重试'), icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async retryProcessing() {
    if (!this.data.coordinationId || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/retry-processing`, {}, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '重新处理失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async recoordinate() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/recoordinate`, {}, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      this.goCoordinator()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '暂时无法重新协调', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  goService() {
    wx.navigateTo({ url: '/pages/chat/chat?agentType=platform_service' })
  },

  goCoordinator() {
    if (!this.data.coordinationId) {
      wx.showToast({ title: '请先填写上方约会表单', icon: 'none', duration: 3000 })
      return
    }
    wx.navigateTo({
      url: `/pages/chat/chat?agentType=date_coordinator&coordinationId=${this.data.coordinationId}`
    })
  }
})
