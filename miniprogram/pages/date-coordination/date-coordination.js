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
  const role = String(coordination && coordination.role || '')
  const hasOwnApplication = Boolean(coordination && coordination.my_application)
  const vm = coordination && coordination.view_model ? coordination.view_model : {}
  const labels = {
    collecting_initiator: '填写第一次约会建议',
    inviting_partner: role === 'invitee' ? '请回应邀请' : '等待对方回应',
    collecting_preferences: role === 'initiator' && coordination.invitee_intent === 'coordinate' && !(coordination.participant_progress || []).find((item) => item.side === 'partner' && item.application_submitted)
      ? '对方正在补充安排'
      : '双方协调中',
    computing_overlap: processingStatus === 'processing' ? '处理中' : (processingStatus === 'failed' ? '处理失败' : '待处理'),
    waiting_confirmations: '等待双方确认',
    no_overlap: '还需要继续协调',
    replanning: '请和AI协调员沟通',
    arranged: '双方已确认',
    invitation_declined: '对方暂未接受',
    manual_handoff: '已转人工协助',
    expired: '邀请已结束',
    cancelled: '已结束',
    closed: '已结束'
  }
  const showCoordinatorCta = vm.show_coordinator_cta !== undefined
    ? Boolean(vm.show_coordinator_cta)
    : (coordination && coordination.can_open_coordinator_chat !== undefined
      ? Boolean(coordination.can_open_coordinator_chat)
      : (status === 'inviting_partner'
        ? role === 'initiator' && hasOwnApplication
        : status !== 'collecting_initiator'))
  const waitingPartnerHero = '约会邀请已发送。当前正在等待对方回应。你仍然可以和 AI 协调员补充或修改自己的安排。'
  const coordinatingHero = coordination.invitee_intent === 'coordinate' && role === 'initiator' && !(coordination.participant_progress || []).find((item) => item.side === 'partner' && item.application_submitted)
    ? '对方已接受约会邀请，目前正在补充自己的安排。'
    : '目前我正在根据双方已经确认的信息继续协调。'
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
    declined: status === 'invitation_declined',
    expired: status === 'expired',
    waitingPartner: status === 'inviting_partner' && role !== 'invitee',
    receivedInvitation: status === 'inviting_partner' && role === 'invitee',
    shouldPoll: status === 'computing_overlap' && ['queued', 'processing'].includes(processingStatus),
    showCoordinatorCta,
    showAcceptInvitation: Boolean(vm.show_accept_invitation || (
      status === 'inviting_partner'
      && role === 'invitee'
      && coordination.invitation_card
      && coordination.invitation_card.primary_complete
    )),
    showCoordinateInstead: Boolean(vm.show_coordinate_instead || (status === 'inviting_partner' && role === 'invitee')),
    showDecline: Boolean(vm.show_decline || (status === 'inviting_partner' && role === 'invitee')),
    showApplicationForm: vm.show_application_form !== undefined
      ? Boolean(vm.show_application_form)
      : Boolean(coordination && coordination.can_submit_application && status === 'collecting_initiator'),
    showOptionalFullForm: Boolean(vm.show_optional_full_form),
    showSharedCard: Boolean(coordination && coordination.shared_coordination && coordination.shared_coordination.ready),
    showInvitationCard: Boolean(coordination && coordination.invitation_card),
    showAdvanceSynthetic: Boolean(coordination && coordination.is_test_data)
      && String(coordination && coordination.synthetic_partner_mode || '') === 'manual_step'
      && role === 'initiator',
    coordinatorHeroText: status === 'inviting_partner' && role !== 'invitee'
      ? waitingPartnerHero
      : (status === 'collecting_preferences' ? coordinatingHero
        : (status === 'no_overlap'
          ? '目前还没有找到完整共同安排。已经一致的条件不会再重复询问。'
          : (status === 'waiting_confirmations'
            ? '已有推荐方案待确认。你也可以继续和 AI 协调员沟通微调。'
            : '正在帮助双方寻找共同安排。你可以随时告诉 AI 想调整的地方。')))
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

function buildPrimaryOptions(form) {
  const slots = []
  ;(form.availability || []).forEach((item) => {
    ;(item.periods || []).forEach((period) => {
      slots.push({ date: item.date, period, key: `${item.date}|${period}` })
    })
  })
  const areas = form.areas || []
  const activities = form.activities || []
  const needsExplicit = slots.length > 1 || areas.length > 1 || activities.length > 1
  return { slots, areas, activities, needsExplicit }
}

function syncPrimaryProposal(form, currentPrimary) {
  const options = buildPrimaryOptions(form)
  const next = Object.assign({}, currentPrimary || {})
  if (options.slots.length === 1) {
    next.date = options.slots[0].date
    next.period = options.slots[0].period
  } else if (next.date && next.period) {
    const still = options.slots.some((slot) => slot.date === next.date && slot.period === next.period)
    if (!still) {
      next.date = ''
      next.period = ''
    }
  }
  if (options.areas.length === 1) next.area = options.areas[0]
  else if (next.area && !options.areas.includes(next.area)) next.area = ''
  if (options.activities.length === 1) next.activity = options.activities[0]
  else if (next.activity && !options.activities.includes(next.activity)) next.activity = ''
  return { primaryProposal: next, primaryOptions: options }
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    coordinationId: '',
    coordination: null,
    coordinationDisplay: buildCoordinationDisplay({}),
    showCoordinatorCta: false,
    showAdvanceSynthetic: false,
    showAcceptInvitation: false,
    showCoordinateInstead: false,
    showDecline: false,
    showApplicationForm: false,
    showOptionalFullForm: false,
    showOptionalForm: false,
    invitationCard: null,
    sharedCoordination: null,
    proposalCard: null,
    resultCard: null,
    advancingSynthetic: false,
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
    primaryProposal: {
      date: '',
      period: '',
      area: '',
      activity: ''
    },
    primaryOptions: {
      slots: [],
      areas: [],
      activities: [],
      needsExplicit: false
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
    // Legacy polite_decline queue UI — only when explicitly still returned by API
    if (coordination.test_simulation && coordination.fixture_response_job) {
      this.applyFixtureSimulation(coordination)
      return
    }
    if (coordination.test_simulation && coordination.await_application) {
      // Old path without real coordination_id — surface as recoverable error so DevTools
      // users recreate via real journey (accept/reject fixtures now mint real rows).
      this.setData({
        pageState: 'error',
        errorMsg: '当前测试对象仍走旧版排队模拟。请将测试对象 fixture_journey 设为 accept_direct / coordinate / decline 后重新匹配并发起约会。'
      })
      return
    }
    const id = coordination.id || coordination.coordination_id || coordination.coordinationId || ''
    const application = coordination.application || coordination.my_application || {}
    const proposal = (coordination.proposal_card)
      || coordination.final_proposal
      || coordination.proposal
      || (coordination.proposals || [])[0]
      || null
    const coordinationDisplay = buildCoordinationDisplay(coordination)
    const form = Object.assign({}, this.data.form, application, {
      availability: application.availability || this.data.form.availability || [],
      activities: application.activities || this.data.form.activities || []
    })
    const synced = syncPrimaryProposal(form, this.data.primaryProposal)
    this.setData({
      coordinationId: String(id),
      coordination,
      coordinationDisplay,
      showCoordinatorCta: Boolean(id) && Boolean(coordinationDisplay.showCoordinatorCta),
      showAdvanceSynthetic: Boolean(coordinationDisplay.showAdvanceSynthetic),
      showAcceptInvitation: Boolean(coordinationDisplay.showAcceptInvitation),
      showCoordinateInstead: Boolean(coordinationDisplay.showCoordinateInstead),
      showDecline: Boolean(coordinationDisplay.showDecline),
      showApplicationForm: Boolean(coordinationDisplay.showApplicationForm) || Boolean(this.data.showOptionalForm && coordinationDisplay.showOptionalFullForm),
      showOptionalFullForm: Boolean(coordinationDisplay.showOptionalFullForm),
      invitationCard: coordination.invitation_card || null,
      sharedCoordination: coordination.shared_coordination || null,
      proposalCard: proposal,
      resultCard: coordination.view_model && coordination.view_model.result_card || null,
      coordinatorHeroText: coordinationDisplay.coordinatorHeroText,
      form,
      selection: buildSelection(form),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions,
      areaText: Array.isArray(form.areas) ? form.areas.join('、') : '',
      proposal,
      pageState: 'success'
    })
    if (coordinationDisplay.shouldPoll && this.pageVisible !== false) this.startCoordinationPolling()
    else this.stopCoordinationPolling()
    if (id) this.markCoordinationSeen(id)
  },

  markCoordinationSeen(id) {
    if (!id || this._markedCoordinationId === String(id)) return
    this._markedCoordinationId = String(id)
    try {
      post(API_PATHS.NOTIFICATIONS_READ, { coordination_id: Number(id) }, { showError: false }).catch(() => null)
    } catch (err) { /* 标记已读失败忽略 */ }
  },

  onEnableSubscribe() {
    const { SUBSCRIBE_TMPL_IDS } = require('../../utils/constants')
    if (!SUBSCRIBE_TMPL_IDS || !SUBSCRIBE_TMPL_IDS.length) {
      wx.showModal({
        title: '暂未开启微信提醒',
        content: '需要在微信公众平台配置“约会协调提醒”订阅消息模板后，才能收到微信推送。你可以先使用站内“协调提醒”入口。',
        showCancel: false
      })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: SUBSCRIBE_TMPL_IDS,
      complete: () => {}
    })
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
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      selectedDate: value,
      'form.availability': nextAvailability,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  removeAvailability(e) {
    const value = e.currentTarget.dataset.value
    const availability = (this.data.form.availability || []).filter((item) => item.date !== value)
    const nextForm = Object.assign({}, this.data.form, { availability })
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.availability': availability,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
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
    const nextForm = Object.assign({}, this.data.form, { availability })
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.availability': availability,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
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
    const nextForm = Object.assign({}, this.data.form, { activities: next })
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.activities': next,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value })
  },

  onAreasInput(e) {
    const areaText = e.detail.value
    const areas = areaText.split(/[、,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 6)
    const nextForm = Object.assign({}, this.data.form, { areas })
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      areaText,
      'form.areas': areas,
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  selectOption(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.currentTarget.dataset.value })
  },

  selectPrimarySlot(e) {
    const date = e.currentTarget.dataset.date
    const period = e.currentTarget.dataset.period
    this.setData({
      'primaryProposal.date': date,
      'primaryProposal.period': period
    })
  },

  selectPrimaryArea(e) {
    this.setData({ 'primaryProposal.area': e.currentTarget.dataset.value })
  },

  selectPrimaryActivity(e) {
    this.setData({ 'primaryProposal.activity': e.currentTarget.dataset.value })
  },

  async respondInvitation(e) {
    if (this.data.responding) return
    const decision = String(e.currentTarget.dataset.decision || '')
    if (!['accept', 'coordinate', 'decline'].includes(decision)) return
    this.setData({ responding: true })
    try {
      const payload = {
        decision,
        invitation_version: Number(
          (this.data.invitationCard && this.data.invitationCard.invitation_version)
          || (this.data.coordination && this.data.coordination.invitation_version)
          || 1
        )
      }
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/invitation-response`, payload, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      if (decision === 'coordinate') this.goCoordinator()
    } catch (err) {
      const code = err && (err.code || err.error_code || err.errorCode)
      const message = (err && err.message) || '操作失败，请重试'
      if (code === 'STALE_INVITATION_VERSION' || /刚刚更新了约会安排|请查看最新方案/.test(message)) {
        wx.showToast({ title: '对方刚刚更新了约会安排，请查看最新方案后再确认。', icon: 'none', duration: 3000 })
        this.refreshCoordination()
      } else if (code === 'INVITATION_ALREADY_RESPONDED' || /刚刚回应了邀请|查看最新协调状态/.test(message)) {
        wx.showToast({ title: '对方刚刚回应了邀请，请查看最新协调状态。', icon: 'none', duration: 3000 })
        this.refreshCoordination()
      } else {
        wx.showToast({ title: message, icon: 'none', duration: 3000 })
      }
    } finally {
      this.setData({ responding: false })
    }
  },

  toggleOptionalForm() {
    const next = !this.data.showOptionalForm
    this.setData({
      showOptionalForm: next,
      showApplicationForm: next && this.data.showOptionalFullForm
    })
  },

  async submitApplication() {
    if (this.data.submitting) return
    if (!this.data.form.availability.length || !this.data.form.areas.length || !this.data.form.activities.length ||
      !this.data.form.budget || !this.data.form.payment_preference || !this.data.form.duration) {
      wx.showToast({ title: '请补充可约时间、区域和活动', icon: 'none' })
      return
    }
    const wasInitiatorDraft = this.data.coordination && this.data.coordination.status === 'collecting_initiator'
    let invitationPrimaryProposal = null
    if (wasInitiatorDraft) {
      const synced = syncPrimaryProposal(this.data.form, this.data.primaryProposal)
      const primary = synced.primaryProposal
      if (!primary.date || !primary.period || !primary.area || !primary.activity) {
        wx.showToast({ title: '请明确选择本次建议安排', icon: 'none' })
        this.setData({
          primaryProposal: primary,
          primaryOptions: synced.primaryOptions
        })
        return
      }
      invitationPrimaryProposal = {
        date: primary.date,
        period: primary.period,
        area: primary.area,
        activity: primary.activity,
        budget: this.data.form.budget,
        duration: this.data.form.duration,
        payment_preference: this.data.form.payment_preference
      }
    }
    this.setData({ submitting: true })
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
      const payload = Object.assign({}, this.data.form)
      if (invitationPrimaryProposal) {
        payload.invitation_primary_proposal = invitationPrimaryProposal
      }
      const result = await put(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/application`, payload, { showError: false })
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

  async advanceSynthetic() {
    if (!this.data.coordinationId || this.data.advancingSynthetic) return
    this.setData({ advancingSynthetic: true })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/advance-synthetic`, {}, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      wx.showToast({ title: '已推进测试对象一步', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '暂时无法推进测试对象', icon: 'none' })
    } finally {
      this.setData({ advancingSynthetic: false })
    }
  },

  goService() {
    wx.navigateTo({ url: '/pages/chat/chat?agentType=platform_service' })
  },

  goCoordinator() {
    if (!this.data.coordinationId) {
      wx.showToast({ title: '协调尚未就绪，请稍后再试', icon: 'none', duration: 3000 })
      return
    }
    if (this.data.coordination && this.data.coordination.status === 'invitation_declined') {
      wx.showToast({ title: '对方暂未接受本次约会邀请', icon: 'none', duration: 3000 })
      return
    }
    if (this.data.coordination && this.data.coordination.status === 'inviting_partner' && this.data.coordination.role === 'invitee') {
      wx.showToast({ title: '请先选择接受这个安排、和 AI 协调，或这次暂不方便', icon: 'none', duration: 3000 })
      return
    }
    wx.navigateTo({
      url: `/pages/chat/chat?agentType=date_coordinator&coordinationId=${this.data.coordinationId}`
    })
  }
})
