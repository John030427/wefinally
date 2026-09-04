const { get, post, put } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { createEmptyDateCoordinationForm, mergeCoordinationForm, preserveArrivalHint } = require('./formState')
const {
  periodLabel,
  coordinationStatusCopy,
  coordinationResultBody
} = require('../../utils/dateCoordinationLabels')

const EMPTY_PRIMARY = { date: '', period: '', area: '', activity: '' }
const PUBLIC_ERROR_COPY = {
  STALE_INVITATION_VERSION: '对方刚刚更新了约会安排，请查看最新方案后再确认。',
  INVALID_INVITATION_VERSION: '这份邀请已更新，请刷新后查看最新内容',
  INVITATION_ALREADY_RESPONDED: '对方刚刚回应了邀请，请查看最新协调状态。',
  INVITATION_EXPIRED: '本次约会邀请已结束，请查看最新状态。',
  PRIMARY_PROPOSAL_REQUIRED: '请明确选择本次建议安排',
  PRIMARY_PROPOSAL_INCOMPLETE: '当前建议安排不完整，请先补齐后再提交',
  PRIMARY_RESOLUTION_REQUIRED: '请先选择本次建议安排',
  INVALID_PRIMARY_SELECTION: '请重新选择本次建议安排',
  STALE_COORDINATION_VERSION: '协调状态刚刚发生变化，请查看最新进度。',
  UNSAFE_ARRIVAL_HINT: '到场识别提示包含不安全内容，请改成穿搭颜色或手持物',
  UNSAFE_ARRIVAL_POSITION: '现场位置包含不安全内容，请只填写公共场所位置',
  ACTIVITY_VENUE_CONFLICT: '活动场地与活动类型不一致，请重新填写',
  DATE_VENUE_NEEDS_CLARIFICATION: '具体门店还未确认，请先和 AI 继续协调',
  COUNTER_OFFER_STALE: '对方刚更新了调整方案，请先看一下最新版本',
  COORDINATION_FINALIZED: '本轮协调已结束，不能继续修改安排',
  CURRENT_STATE_INVALID: '当前状态已变化，请刷新后再试',
  WAITING_PARTNER: '请等待对方完成回应',
  FORBIDDEN: '无权操作该约会协调',
  DATE_APPLICATION_INVALID: '约会安排格式有误，请检查后重试',
  CLIENT_UPGRADE_REQUIRED: '请更新测试版后再继续操作',
  QA_RESET_CONFIRM_REQUIRED: '请先确认重置文案后再试',
  QA_RESET_FORBIDDEN: '当前账号无权重置本轮协调'
}
const REFRESH_ERROR_CODES = {
  STALE_INVITATION_VERSION: true,
  INVALID_INVITATION_VERSION: true,
  INVITATION_ALREADY_RESPONDED: true,
  INVITATION_EXPIRED: true,
  STALE_COORDINATION_VERSION: true,
  COUNTER_OFFER_STALE: true,
  COORDINATION_FINALIZED: true,
  CURRENT_STATE_INVALID: true
}

function errorCodeOf(err) {
  return String((err && (err.error || err.code || err.error_code || err.errorCode)) || '')
}

function publicErrorToast(err, fallback) {
  const code = errorCodeOf(err)
  return PUBLIC_ERROR_COPY[code] || (err && err.message) || fallback || '操作失败，请重试'
}

function dateText(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function periodForTime(value) {
  const hour = Number(String(value || '').slice(0, 2))
  if (!Number.isFinite(hour)) return ''
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 19) return 'evening'
  return 'night'
}

function deriveVenueClarification(form) {
  const value = String(form && form.activity_venue || '').trim()
  const activity = String(form && form.activities && form.activities[0] || '').trim()
  if (!value || !activity) return null
  const concrete = /(?:店|餐厅|饭店|餐馆|影城|影院|电影院|美术馆|博物馆|展馆|桌游馆)$/.test(value)
    || (/(?:星巴克|瑞幸|喜茶|奈雪|太二|海底捞|润园四季|百老汇|英皇)/.test(value)
      && !/^(?:星巴克|瑞幸|喜茶|奈雪|太二|海底捞|润园四季|百老汇|英皇)$/.test(value))
  if (concrete) return null
  const activityDetail = /^(?:椰子鸡|火锅|烤肉|烧烤|粤菜|川菜|湘菜|日料|西餐|披萨|牛排|海鲜)$/.test(value)
    ? value
    : activity
  return {
    areaHint: activityDetail === value ? '' : value,
    activityDetail,
    missingText: '还需要确认具体门店'
  }
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
  const labels = Object.assign({}, {
    collecting_initiator: coordinationStatusCopy('collecting_initiator'),
    inviting_partner: role === 'invitee' ? '请回应邀请' : coordinationStatusCopy('inviting_partner'),
    collecting_preferences: role === 'initiator' && coordination.invitee_intent === 'coordinate' && !(coordination.participant_progress || []).find((item) => item.side === 'partner' && item.application_submitted)
      ? '对方正在补充安排'
      : coordinationStatusCopy('collecting_preferences'),
    computing_overlap: processingStatus === 'processing' ? '处理中' : (processingStatus === 'failed' ? '处理失败' : coordinationStatusCopy('computing_overlap')),
    waiting_confirmations: coordinationStatusCopy('waiting_confirmations'),
    no_overlap: coordinationStatusCopy('no_overlap'),
    replanning: coordinationStatusCopy('replanning'),
    arranged: coordinationStatusCopy('arranged'),
    invitation_declined: coordinationStatusCopy('invitation_declined'),
    manual_handoff: coordinationStatusCopy('manual_handoff'),
    expired: coordinationStatusCopy('expired'),
    cancelled: coordinationStatusCopy('cancelled'),
    closed: coordinationStatusCopy('closed'),
    proposing: coordinationStatusCopy('proposing')
  })
  const showCoordinatorCta = status === 'collecting_initiator'
    ? false
    : (vm.show_coordinator_cta !== undefined
      ? Boolean(vm.show_coordinator_cta)
      : (coordination && coordination.can_open_coordinator_chat !== undefined
        ? Boolean(coordination.can_open_coordinator_chat)
        : (status === 'inviting_partner'
          ? role === 'initiator' && hasOwnApplication
          : status !== 'collecting_initiator')))
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
    shouldPoll: (status === 'computing_overlap' && ['queued', 'processing'].includes(processingStatus))
      || (status === 'arranged' && !(coordination.meeting_checkin
        && (coordination.meeting_checkin.meeting_confirmed || coordination.meeting_checkin.meeting_paused))),
    showCoordinatorCta,
    showPreSubmitCoordinatorCard: status === 'collecting_initiator' && role === 'initiator',
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
          ? (coordination.counter_offer_card
            ? '对方提出了一份明确的调整方案。请先核对改动项和完整方案，再决定接受或继续调整。'
            : '目前还没有找到完整共同安排。已经一致的条件不会再重复询问。')
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
      slots.push({
        date: item.date,
        period,
        periodText: periodLabel(period),
        key: `${item.date}|${period}`
      })
    })
  })
  const areas = form.areas || []
  const activities = form.activities || []
  const needsExplicit = slots.length > 1 || areas.length > 1 || activities.length > 1
  return { slots, areas, activities, needsExplicit }
}

function withPeriodTexts(form) {
  const next = Object.assign({}, form || createEmptyDateCoordinationForm())
  next.availability = (next.availability || []).map((item) => Object.assign({}, item, {
    periodsText: (item.periods || []).map(periodLabel).filter(Boolean).join('、')
  }))
  return next
}

function serializeApplication(form) {
  const payload = Object.assign({}, form || {})
  payload.availability = (payload.availability || []).map((item) => ({
    date: item.date,
    periods: item.periods || []
  }))
  delete payload.periodsText
  return payload
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
    showPreSubmitCoordinatorCard: false,
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
    currentPlanCard: null,
    meetingCheckin: null,
    arrivalPosition: '',
    resultCard: null,
    advancingSynthetic: false,
    coordinatorHeroText: '正在寻找双方共同安排。你可以随时和 AI 约会协调员沟通。',
    refreshingCoordination: false,
    resettingQaCoordination: false,
    fixtureSimulation: null,
    fixtureStage: '',
    fixtureStatusText: '',
    fixtureResponseMessage: '',
    refreshingFixture: false,
    dateMin: '',
    dateMax: '',
    selectedDate: '',
    areaText: '',
    form: createEmptyDateCoordinationForm(),
    venueClarificationCard: null,
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
      { value: 'morning', label: '上午' },
      { value: 'afternoon', label: '下午' },
      { value: 'evening', label: '傍晚' },
      { value: 'night', label: '晚上' }
    ],
    activityOptions: [
      { value: '咖啡', label: '咖啡' },
      { value: '吃饭', label: '吃饭' },
      { value: '奶茶', label: '奶茶' },
      { value: '散步', label: '散步' },
      { value: '看展', label: '看展' },
      { value: '电影', label: '电影' },
      { value: '桌游', label: '桌游' }
    ],
    budgetOptions: [
      { value: 'under-50', label: '50元以内' },
      { value: '50-100', label: '50-100元' },
      { value: '100-200', label: '100-200元' },
      { value: 'over-200', label: '200元以上' },
      { value: 'flexible', label: '灵活' }
    ],
    paymentOptions: [
      { value: 'aa', label: '接受AA' },
      { value: 'partner_pays', label: '希望对方请客' },
      { value: 'self_pays', label: '我愿意请客' },
      { value: 'flexible', label: '都可以' }
    ],
    durationOptions: [
      { value: 'about-1h', label: '1小时左右' },
      { value: '1-2h', label: '1-2小时' },
      { value: '2-3h', label: '2-3小时' },
      { value: 'flexible', label: '灵活' }
    ],
    proposal: null,
    counterOfferCard: null,
    pendingAction: '',
    arrivalHintFocused: false,
    lastServerArrivalHint: ''
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
    const coordinationChanged = Boolean(this.data.coordinationId)
      && String(this.data.coordinationId) !== String(id)
    const application = coordination.application || coordination.my_application || {}
    const proposal = (coordination.proposal_card)
      || coordination.final_proposal
      || coordination.proposal
      || (coordination.proposals || [])[0]
      || null
    const currentPlanCard = proposal || coordination.invitation_card || null
    const coordinationDisplay = buildCoordinationDisplay(coordination)
    const serverArrivalHint = String(application.arrival_hint || '')
    let form = mergeCoordinationForm(this.data.form, application, coordinationChanged)
    form = preserveArrivalHint(form, this.data.form, {
      focused: Boolean(this.data.arrivalHintFocused),
      lastServerValue: this.data.lastServerArrivalHint || ''
    })
    form = withPeriodTexts(form)
    const primaryBase = coordinationChanged ? EMPTY_PRIMARY : this.data.primaryProposal
    const synced = syncPrimaryProposal(form, primaryBase)
    const nextArrivalPosition = coordinationChanged
      ? String(coordination.meeting_checkin && coordination.meeting_checkin.my_arrival_position || '')
      : (this.data.arrivalPosition || String(coordination.meeting_checkin && coordination.meeting_checkin.my_arrival_position || ''))
    const resultCard = coordination.view_model && coordination.view_model.result_card
      ? Object.assign({}, coordination.view_model.result_card, {
        body: coordination.view_model.result_card.body
          || coordinationResultBody(coordination.status)
      })
      : null
    this.setData({
      coordinationId: String(id),
      coordination,
      coordinationDisplay,
      showCoordinatorCta: Boolean(id) && Boolean(coordinationDisplay.showCoordinatorCta),
      showPreSubmitCoordinatorCard: Boolean(id) && Boolean(coordinationDisplay.showPreSubmitCoordinatorCard),
      showAdvanceSynthetic: Boolean(coordinationDisplay.showAdvanceSynthetic),
      showAcceptInvitation: Boolean(coordinationDisplay.showAcceptInvitation),
      showCoordinateInstead: Boolean(coordinationDisplay.showCoordinateInstead),
      showDecline: Boolean(coordinationDisplay.showDecline),
      showApplicationForm: Boolean(coordinationDisplay.showApplicationForm) || Boolean(!coordinationChanged && this.data.showOptionalForm && coordinationDisplay.showOptionalFullForm),
      showOptionalFullForm: Boolean(coordinationDisplay.showOptionalFullForm),
      showOptionalForm: coordinationChanged ? false : this.data.showOptionalForm,
      invitationCard: coordination.invitation_card || null,
      sharedCoordination: coordination.shared_coordination || null,
      counterOfferCard: coordination.counter_offer_card || null,
      proposalCard: proposal,
      currentPlanCard,
      meetingCheckin: coordination.meeting_checkin || null,
      arrivalPosition: nextArrivalPosition,
      lastServerArrivalHint: serverArrivalHint,
      resultCard,
      coordinatorHeroText: coordinationDisplay.coordinatorHeroText,
      form,
      selection: buildSelection(form),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions,
      areaText: Array.isArray(form.areas) ? form.areas.join('、') : '',
      selectedDate: form.availability[0] ? form.availability[0].date : '',
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
      if (!isSilent) wx.showToast({ title: publicErrorToast(err, '刷新失败'), icon: 'none' })
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
      if (!isSilent) wx.showToast({ title: publicErrorToast(err, '刷新失败'), icon: 'none' })
    } finally {
      this.setData({ refreshingCoordination: false })
    }
  },

  resetQaCoordination() {
    if (!this.data.coordinationId || this.data.resettingQaCoordination) return
    wx.showModal({
      title: '重新开始本轮测试？',
      content: '当前协调会被关闭，聊天和操作记录仍会保留。之后可重新申请第一次约会。',
      confirmText: '确认重置',
      confirmColor: '#D14D6B',
      success: async (modal) => {
        if (!modal.confirm) return
        this.setData({ resettingQaCoordination: true })
        try {
          await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/qa-reset`, {
            confirm_text: '重新开始本轮测试'
          }, { showError: false })
          this.setData({ form: createEmptyDateCoordinationForm() })
          wx.showToast({ title: '本轮已重置', icon: 'success' })
          setTimeout(() => wx.navigateBack({ delta: 1 }), 500)
        } catch (err) {
          wx.showToast({ title: publicErrorToast(err, '重置失败，请重试'), icon: 'none', duration: 3000 })
        } finally {
          this.setData({ resettingQaCoordination: false })
        }
      }
    })
  },

  onDateChange(e) {
    const value = e.detail.value
    const previous = (this.data.form.availability || [])[0]
    const defaultSlot = { date: value, periods: ['afternoon'] }
    const nextAvailability = [{
      date: value,
      periods: previous && previous.periods && previous.periods.length ? [previous.periods[0]] : defaultSlot.periods
    }]
    const nextForm = withPeriodTexts(Object.assign({}, this.data.form, { availability: nextAvailability }))
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      selectedDate: value,
      'form.availability': nextForm.availability,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  removeAvailability(e) {
    const value = e.currentTarget.dataset.value
    const availability = (this.data.form.availability || []).filter((item) => item.date !== value)
    const nextForm = withPeriodTexts(Object.assign({}, this.data.form, { availability }))
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.availability': nextForm.availability,
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
      return Object.assign({}, item, { periods: [period] })
    })
    const nextForm = withPeriodTexts(Object.assign({}, this.data.form, { availability }))
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.availability': nextForm.availability,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  toggleActivity(e) {
    const value = e.currentTarget.dataset.value
    const next = [value]
    const nextForm = Object.assign({}, this.data.form, { activities: next })
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.activities': next,
      venueClarificationCard: deriveVenueClarification(nextForm),
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    if (key === 'activity_venue') {
      const nextForm = Object.assign({}, this.data.form, { activity_venue: value })
      this.setData({ 'form.activity_venue': value, venueClarificationCard: deriveVenueClarification(nextForm) })
      return
    }
    this.setData({ [`form.${key}`]: value })
  },

  onAreasInput(e) {
    const areaText = e.detail.value
    const areas = areaText.trim() ? [areaText.trim()] : []
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

  onStartTimeChange(e) {
    const startTime = e.detail.value
    const period = periodForTime(startTime)
    const targetDate = this.data.primaryProposal.date
      || ((this.data.form.availability || [])[0] && this.data.form.availability[0].date)
    const availability = (this.data.form.availability || []).map((item) => (
      item.date === targetDate && period
        ? Object.assign({}, item, { periods: [period] })
        : item
    ))
    const nextForm = withPeriodTexts(Object.assign({}, this.data.form, { start_time: startTime, availability }))
    const synced = syncPrimaryProposal(nextForm, this.data.primaryProposal)
    this.setData({
      'form.start_time': startTime,
      'form.availability': nextForm.availability,
      selection: buildSelection(nextForm),
      primaryProposal: synced.primaryProposal,
      primaryOptions: synced.primaryOptions
    })
  },

  onArrivalHintInput(e) {
    this.setData({ 'form.arrival_hint': e.detail.value })
  },

  onArrivalPositionInput(e) {
    this.setData({ arrivalPosition: e.detail.value })
  },

  onArrivalHintFocus() {
    this.setData({ arrivalHintFocused: true })
  },

  onArrivalHintBlur() {
    this.setData({ arrivalHintFocused: false })
  },

  notifyActionError(err, fallback) {
    const code = errorCodeOf(err)
    const recovery = String((err && (err.recovery || err.data && err.data.recovery)) || '')
    wx.showToast({ title: publicErrorToast(err, fallback), icon: 'none', duration: 3000 })
    if (recovery === 'refresh' || REFRESH_ERROR_CODES[code]) {
      this.refreshCoordination()
      return
    }
    if (recovery === 'complete_form') {
      this.setData({ showApplicationForm: true, showOptionalForm: true })
      return
    }
    if (recovery === 'open_coordinator') {
      setTimeout(() => this.goCoordinator(), 300)
      return
    }
    if (recovery === 'contact_support') {
      wx.showModal({
        title: '需要人工协助',
        content: '请通过官方客服继续处理，不要私下交换联系方式。',
        showCancel: false
      })
    }
  },

  async updateArrivalHint() {
    if (!this.data.form.arrival_hint) {
      wx.showToast({ title: '请先填写到场识别提示', icon: 'none' })
      return
    }
    return this.submitMeetingAction('set_arrival_hint', { arrival_hint: this.data.form.arrival_hint })
  },

  async submitMeetingAction(action, extra) {
    if (!this.data.coordinationId || this.data.pendingAction) return
    this.setData({ pendingAction: action })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/meeting-check-in`, Object.assign({ action }, extra || {}), { showError: false })
      this.setData({ meetingCheckin: result })
      const message = {
        arrived: '到场状态已记录，对方打开或刷新协调会话后可看到',
        met: result.meeting_confirmed ? '双方已确认见面' : '已确认，等待对方',
        not_found: '状态已记录，对方打开协调会话后可看到',
        mismatch: '会合已暂停，请先确保安全',
        set_arrival_hint: '识别提示已同步'
      }[action] || '状态已更新'
      wx.showToast({ title: message, icon: action === 'mismatch' ? 'none' : 'success', duration: 2500 })
    } catch (err) {
      this.notifyActionError(err, '操作失败，请重试')
    } finally {
      this.setData({ pendingAction: '' })
    }
  },

  markArrived() {
    return this.submitMeetingAction('arrived', { arrival_position: this.data.arrivalPosition })
  },

  confirmMet() {
    return this.submitMeetingAction('met')
  },

  reportNotFound() {
    return this.submitMeetingAction('not_found')
  },

  reportMismatch() {
    return this.submitMeetingAction('mismatch')
  },

  async respondInvitation(e) {
    if (this.data.pendingAction) return
    const decision = String(e.currentTarget.dataset.decision || '')
    if (!['accept', 'coordinate', 'decline'].includes(decision)) return
    this.setData({ pendingAction: decision })
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
      this.notifyActionError(err, '操作失败，请重试')
    } finally {
      this.setData({ pendingAction: '' })
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
    if (this.data.pendingAction) return
    if (!this.data.form.availability.length || !this.data.form.areas.length || !this.data.form.activities.length ||
      !this.data.form.budget || !this.data.form.payment_preference || !this.data.form.duration ||
      !this.data.form.start_time || !this.data.form.activity_venue) {
      wx.showToast({ title: '请补充具体时间和活动场地', icon: 'none', duration: 3000 })
      return
    }
    const needsVenueClarification = Boolean(this.data.venueClarificationCard)
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
        contract_version: 2,
        start_time: this.data.form.start_time,
        activity_venue: this.data.form.activity_venue,
        meet_point: this.data.form.meet_point,
        arrival_hint: this.data.form.arrival_hint,
        budget: this.data.form.budget,
        duration: this.data.form.duration,
        payment_preference: this.data.form.payment_preference
      }
    }
    this.setData({ pendingAction: 'submit' })
    try {
      if (this.fixtureDraft && this.data.coordination && this.data.coordination.test_simulation) {
        const result = await post(`${API_PATHS.DATE_COORDINATIONS}/fixture-applications`, {
          match_log_id: this.fixtureDraft.match_log_id,
          match_user_id: this.fixtureDraft.match_user_id,
          application: serializeApplication(this.data.form)
        }, { showError: false })
        this.applyFixtureSimulation(result)
        wx.showToast({ title: '约会申请已提交', icon: 'success' })
        return
      }
      const storageKey = `date_submit_req_${this.data.coordinationId}_${Number((this.data.coordination && this.data.coordination.coordination_version) || 1)}`
      let requestId = this.data.submitRequestId || ''
      try {
        if (!requestId) requestId = String(wx.getStorageSync(storageKey) || '')
      } catch (err) {
        requestId = ''
      }
      if (!requestId) {
        requestId = `submit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
        try { wx.setStorageSync(storageKey, requestId) } catch (err) { /* ignore */ }
        this.setData({ submitRequestId: requestId })
      }
      const payload = serializeApplication(this.data.form)
      payload.request_id = requestId
      payload.expected_coordination_version = Number((this.data.coordination && this.data.coordination.coordination_version) || 1)
      if (invitationPrimaryProposal) {
        payload.invitation_primary_proposal = invitationPrimaryProposal
      }
      const result = await put(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/application`, payload, { showError: false })
      try { wx.removeStorageSync(storageKey) } catch (err) { /* ignore */ }
      this.setData({ submitRequestId: '' })
      this.applyCoordination(normalizeCoordination(result))
      const notificationPending = String(result && result.notification_status || '') === 'pending'
      wx.showToast({
        title: wasInitiatorDraft
          ? (notificationPending ? '已保存，通知处理中' : '已保存偏好，正在邀请对方')
          : '已提交约会偏好',
        icon: 'success'
      })
      if (wasInitiatorDraft && needsVenueClarification) {
        setTimeout(() => this.goCoordinator(), 300)
      }
    } catch (err) {
      this.notifyActionError(err, '提交失败，请重试')
    } finally {
      this.setData({ pendingAction: '' })
    }
  },

  async confirmProposal() {
    return this.respondToProposal('confirm')
  },

  async acceptCounterOffer() {
    const offer = this.data.counterOfferCard
    if (!offer || this.data.pendingAction) return
    this.setData({ pendingAction: 'accept' })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/counter-offer/accept`, {
        coordination_version: Number(offer.coordination_version || this.data.coordination.coordination_version),
        proposal_token: offer.proposal_token
      }, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      wx.showToast({ title: '已接受调整，正在生成方案', icon: 'success' })
    } catch (err) {
      this.notifyActionError(err, '接受失败，请刷新后重试')
    } finally {
      this.setData({ pendingAction: '' })
    }
  },

  async rejectProposal() {
    return this.respondToProposal('reject')
  },

  async respondToProposal(decision) {
    if (!this.data.proposal || this.data.pendingAction) return
    this.setData({ pendingAction: decision })
    try {
      const proposalId = this.data.proposal.id || this.data.proposal.proposal_id
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/proposals/${proposalId}/confirm`, {
        coordination_version: this.data.coordination.coordination_version,
        decision
      }, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      if (decision === 'reject') this.goCoordinator()
    } catch (err) {
      this.notifyActionError(err, decision === 'reject' ? '暂时无法继续协调' : '确认失败，请重试')
    } finally {
      this.setData({ pendingAction: '' })
    }
  },

  async retryProcessing() {
    if (!this.data.coordinationId || this.data.pendingAction) return
    this.setData({ pendingAction: 'retry' })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/retry-processing`, {}, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
    } catch (err) {
      this.notifyActionError(err, '重新处理失败')
    } finally {
      this.setData({ pendingAction: '' })
    }
  },

  async recoordinate() {
    if (this.data.pendingAction) return
    this.setData({ pendingAction: 'recoordinate' })
    try {
      const result = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/recoordinate`, {}, { showError: false })
      this.applyCoordination(normalizeCoordination(result))
      this.goCoordinator()
    } catch (err) {
      this.notifyActionError(err, '暂时无法重新协调')
    } finally {
      this.setData({ pendingAction: '' })
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
      wx.showToast({ title: publicErrorToast(err, '暂时无法推进测试对象'), icon: 'none' })
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
      wx.showToast({ title: '请先选择接受完整方案、只调整部分安排，或这次暂不方便', icon: 'none', duration: 3000 })
      return
    }
    wx.navigateTo({
      url: `/pages/chat/chat?agentType=date_coordinator&coordinationId=${this.data.coordinationId}`
    })
  }
})
