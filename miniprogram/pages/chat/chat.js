const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { formatDate } = require('../../utils/util')
const {
  AGENT_TYPES,
  MIN_LOADER_MS,
  ROTATE_MS,
  SLOW_HINT_MS,
  createPendingAssistantMessage,
  completeAssistantMessage,
  errorAssistantMessage,
  updateMessageById,
  nextRotatedWaitingText,
  elapsedAtLeast,
  evaluateAssistantReply,
  resolveCompleteAssistantReply
} = require('../../utils/aiChatWaiting')

const PATCH_FIELD_LABELS = {
  availability: '可约时间',
  areas: '偏好区域',
  activities: '活动偏好',
  budget: '人均预算',
  payment_preference: '费用方式',
  duration: '可接受时长',
  transport_constraints: '出行限制',
  other_requirements: '其他要求',
  share_message: '对方可见内容'
}

function formatPatchValue(value) {
  if (Array.isArray(value)) return value.map(formatPatchValue).filter(Boolean).join('、') || '未设置'
  if (value && typeof value === 'object') {
    return Object.keys(value).map((key) => formatPatchValue(value[key])).filter(Boolean).join('、') || '未设置'
  }
  return value === undefined || value === null || value === '' ? '未设置' : String(value)
}

function normalizeResolutionFields(resolution) {
  const fields = resolution && Array.isArray(resolution.fields) ? resolution.fields : []
  const labels = { area: '区域', activity: '活动', time: '时间' }
  return fields.map((field) => {
    const name = String(field.field || '')
    const options = (field.options || []).map((opt) => {
      if (opt && typeof opt === 'object') {
        const value = String(opt.value || opt.area || opt.activity || '')
        const date = String(opt.date || '')
        const period = String(opt.period || '')
        const label = String(opt.label || value || '')
        return {
          key: date ? `${date}_${period}` : value || label,
          value,
          label,
          date,
          period
        }
      }
      const text = String(opt)
      return { key: text, value: text, label: text, date: '', period: '' }
    })
    return { field: name, label: labels[name] || '安排', options }
  })
}

function normalizePatchPreview(raw, requiresConfirmation) {
  const patch = raw && (raw.patch_preview || raw.patchPreview || raw)
  const preview = patch && patch.preview
  if (!patch || !preview || !Array.isArray(preview.changed_fields)) return null
  const status = patch.status || 'pending_confirmation'
  const primaryResolutionRequired = Boolean(preview.primary_resolution_required) || status === 'pending_primary_selection'
  const partialOverride = (patch.operation || 'modify') === 'create'
    && preview.application_source === 'invitee_override'
  const inheritedFields = partialOverride
    ? Object.keys(preview.preference_evidence || {})
      .filter((field) => preview.preference_evidence[field] === 'inherited')
      .map((field) => PATCH_FIELD_LABELS[field] || '')
      .filter(Boolean)
    : []
  return {
    id: String(patch.id || patch.patch_id || ''),
    operation: patch.operation || 'modify',
    status,
    requiresConfirmation: !primaryResolutionRequired && (
      requiresConfirmation === true
      || patch.requires_confirmation === true
      || status === 'pending_confirmation'
    ),
    primaryResolutionRequired,
    primaryResolutionFields: normalizeResolutionFields(preview.primary_resolution),
    resolutionPrompt: preview.resolution_prompt || '本次建议安排需要确认',
    sourceChanges: preview.source_changes || patch.changes || {},
    primarySelection: preview.primary_selection || patch.primary_selection || {},
    partialOverride,
    title: partialOverride
      ? '局部调整确认'
      : ((patch.operation || 'modify') === 'create' ? '约会安排发送预览' : '约会条件修改预览'),
    inheritedText: inheritedFields.join('、'),
    confirmLabel: partialOverride ? '确认这些调整' : ((patch.operation || 'modify') === 'create' ? '确认发送' : '确认修改'),
    cancelLabel: partialOverride ? '重新说明' : ((patch.operation || 'modify') === 'create' ? '暂不发送' : '暂不修改'),
    changes: preview.changed_fields.map((field) => {
      let before = formatPatchValue(preview.before && preview.before[field])
      let after = formatPatchValue(preview.after && preview.after[field])
      if (field === 'payment_preference' && preview.primary_payment_changed) {
        before = preview.primary_payment_before_text || before
        after = preview.primary_payment_after_text || after
      }
      return {
        field,
        label: PATCH_FIELD_LABELS[field] || '约会条件',
        before,
        after
      }
    }),
    affectsExistingProposal: Boolean(preview.affects_existing_proposal),
    willNotifyPartner: Boolean(preview.will_notify_partner)
  }
}

function normalizePartnerInquiryPreview(raw, incoming = false) {
  const preview = raw && (raw.partner_inquiry_preview || raw.partnerInquiryPreview || raw)
  if (!preview || !preview.proposal_card || !Array.isArray(preview.changes)) return null
  const card = preview.proposal_card
  return {
    status: String(preview.status || 'pending_confirmation'),
    incoming,
    title: String(preview.title || '询问对方前请确认'),
    body: String(preview.body || ''),
    unchangedText: String(preview.unchanged_text || ''),
    timeText: String(card.time_text || ''),
    areaText: String(card.area_text || ''),
    activityText: String(card.activity_text || ''),
    budgetText: String(card.budget_text || ''),
    durationText: String(card.duration_text || ''),
    changes: preview.changes.map((item) => ({
      label: String(item.label || '调整项'),
      beforeText: String(item.before_text || ''),
      afterText: String(item.after_text || '')
    })),
    confirmLabel: String(preview.confirm_label || '确认询问对方'),
    cancelLabel: String(preview.cancel_label || '暂不询问')
  }
}

function assistantMessage(item, index) {
  const patchPreview = normalizePatchPreview(item && item.patch_preview, item && item.requires_confirmation)
  const partnerInquiryPreview = normalizePartnerInquiryPreview(
    item && (item.partner_inquiry_preview || item.partner_inquiry),
    Boolean(item && item.partner_inquiry && !item.partner_inquiry_preview)
  )
  const content = item.ai_content || item.reply || item.content || '已收到您的咨询'
  return {
    id: `b_${item.id || index}`,
    content,
    isBot: true,
    status: 'completed',
    waitingText: '',
    timeText: formatDate(item.create_time || item.createdAt || item.time, 'HH:mm'),
    patchPreview,
    partnerInquiryPreview,
    handoff: item && item.handoff && item.handoff.available ? item.handoff : null,
    reveal: false,
    errorText: ''
  }
}

function normalizeMessages(raw) {
  const rows = Array.isArray(raw) ? raw : []
  const flat = []
  rows.forEach((item, index) => {
    const timeText = formatDate(item.create_time || item.createdAt || item.time, 'HH:mm')
    if (item.user_content || item.question || item.role === 'user') {
      flat.push({
        id: `u_${item.id || index}`,
        content: item.user_content || item.question || item.content || '',
        isBot: false,
        status: 'completed',
        timeText
      })
    }
    if (item.ai_content || item.reply || item.role === 'assistant') {
      flat.push(assistantMessage(item, index))
    }
  })
  return flat
}

function decodePrompt(value) {
  const text = String(value || '')
  try {
    return decodeURIComponent(text)
  } catch (err) {
    return text
  }
}

function makeIds(prefix) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    requestId: `req_${stamp}`,
    pendingMessageId: `${prefix}_${stamp}`
  }
}

Page({
  data: {
    pageState: 'loading',
    messages: [],
    inputText: '',
    sending: false,
    scrollToView: '',
    handoffContext: null,
    handoffAutoSent: false,
    agentType: AGENT_TYPES.PLATFORM_SERVICE,
    agentTitle: '平台AI客服',
    sessionId: '',
    sessionReady: false,
    coordinationId: '',
    coordinatorWelcome: '',
    coordinatorReadOnly: false,
    patchSubmitting: false,
    supportCode: '',
    supportCodeState: 'loading',
    supportCodeError: ''
  },

  _pageActive: true,
  _waitingTimer: null,
  _slowHintTimer: null,
  _activeRequestId: '',
  _turnStarting: false,

  onLoad(options) {
    this._pageActive = true
    const requestedType = String(options.agentType || '')
    const agentType = Object.values(AGENT_TYPES).includes(requestedType) ? requestedType : AGENT_TYPES.PLATFORM_SERVICE
    const coordinationId = String(options.coordinationId || '')
    const handoffTicketId = Number(options.handoffTicketId || 0)
    const matchLogId = Number(options.matchLogId || 0)
    const matchUserId = Number(options.matchUserId || 0)
    this.setData({
      agentType,
      agentTitle: agentType === AGENT_TYPES.LOVE_ADVISOR
        ? 'AI恋爱助手'
        : (agentType === AGENT_TYPES.DATE_COORDINATOR ? 'AI约会协调员' : '平台AI客服'),
      coordinationId,
      inputText: decodePrompt(options.prompt)
    })
    wx.setNavigationBarTitle({ title: this.data.agentTitle })
    if (handoffTicketId || matchLogId || matchUserId) {
      this.setData({ handoffContext: {
        handoff_ticket_id: handoffTicketId,
        match_log_id: matchLogId,
        match_user_id: matchUserId
      } })
    }
    this.loadSupportCode()
    this.loadHistory()
  },

  onUnload() {
    this._pageActive = false
    this.clearWaitingTimers()
  },

  onHide() {
    // Keep timers while page is in stack; clear only on unload.
  },

  clearWaitingTimers() {
    if (this._waitingTimer) {
      clearInterval(this._waitingTimer)
      this._waitingTimer = null
    }
    if (this._slowHintTimer) {
      clearTimeout(this._slowHintTimer)
      this._slowHintTimer = null
    }
  },

  safeSetData(payload) {
    if (!this._pageActive) return
    this.setData(payload)
  },

  replaceMessageById(id, updater) {
    const result = updateMessageById(this.data.messages, id, updater)
    if (!result.found) return null
    this.safeSetData({ messages: result.messages })
    return result.message
  },

  startWaitingCopyRotation(pendingMessageId) {
    this.clearWaitingTimers()
    this._waitingTimer = setInterval(() => {
      if (!this._pageActive) {
        this.clearWaitingTimers()
        return
      }
      const current = this.data.messages.find((m) => m.id === pendingMessageId)
      if (!current || current.status !== 'generating') {
        this.clearWaitingTimers()
        return
      }
      const next = nextRotatedWaitingText(current)
      this.replaceMessageById(pendingMessageId, next)
    }, ROTATE_MS)

    this._slowHintTimer = setTimeout(() => {
      if (!this._pageActive) return
      const current = this.data.messages.find((m) => m.id === pendingMessageId)
      if (!current || current.status !== 'generating') return
      this.replaceMessageById(pendingMessageId, { waitingText: '还在处理中，请稍候…' })
    }, SLOW_HINT_MS)
  },

  async loadSupportCode() {
    this.setData({ supportCodeState: 'loading', supportCodeError: '' })
    try {
      const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      const supportCode = String(profile && profile.support_code || '').trim().toUpperCase()
      if (!/^WF-\d{6}$/.test(supportCode)) throw new Error('用户ID暂不可用')
      this.setData({ supportCode, supportCodeState: 'ready', supportCodeError: '' })
    } catch (err) {
      this.setData({
        supportCode: '',
        supportCodeState: 'error',
        supportCodeError: (err && err.message) || '用户ID加载失败'
      })
    }
  },

  retrySupportCode() {
    this.loadSupportCode()
  },

  copySupportCode() {
    if (this.data.supportCodeState !== 'ready' || !this.data.supportCode) {
      wx.showToast({ title: '用户ID尚未加载', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: this.data.supportCode,
      success: () => wx.showToast({ title: '用户ID已复制', icon: 'success' })
    })
  },

  welcomeMessage() {
    if (this.data.coordinatorWelcome) return this.data.coordinatorWelcome
    if (this.data.agentType === AGENT_TYPES.LOVE_ADVISOR) {
      return '你好，我是 WeFinally AI恋爱助手。可以陪你聊沟通、边界和见面准备；信息有限时，我会明确说明知识不足。'
    }
    if (this.data.agentType === AGENT_TYPES.DATE_COORDINATOR) {
      return '我是你的 AI 约会协调员。\n\n你可以随时告诉我希望调整的时间、区域、活动、预算或其他要求。\n\n我会先展示修改预览，经你确认后才更新本次协调。\n\n我不会向你透露对方的私人回答。\n\nAI生成内容仅供参考。'
    }
    return '你好，我是 WeFinally 平台AI客服，可协助查询会员、匹配、规则、见面与订单问题。'
  },

  async ensureSession() {
    if (this.data.sessionReady && this.data.sessionId) return this.data.sessionId
    const result = await post(API_PATHS.AGENT_SESSIONS, {
      agent_type: this.data.agentType,
      agentType: this.data.agentType,
      coordination_id: this.data.coordinationId
    }, { showError: false })
    const session = result && (result.session || result)
    const sessionId = session && (session.id || session.session_id || session.sessionId)
    if (!sessionId) throw new Error('会话创建失败')
    this.setData({
      sessionId: String(sessionId),
      sessionReady: true,
      coordinatorWelcome: String(session.coordinator_welcome || ''),
      coordinatorReadOnly: Boolean(session.coordinator_read_only)
    })
    return String(sessionId)
  },

  async loadAgentHistory() {
    const sessionId = await this.ensureSession()
    const result = await get(`${API_PATHS.AGENT_SESSIONS}/${sessionId}/messages`, {}, { showError: false })
    return normalizeMessages((result && (result.messages || result.list)) || result)
  },

  async loadLegacyHistory() {
    const data = await get(API_PATHS.CHAT_HISTORY, {}, { showError: false })
    return normalizeMessages((data && (data.messages || data.list)) || data)
  },

  async loadHistory() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    let messages = []
    try {
      messages = await this.loadAgentHistory()
    } catch (err) {
      if (this.data.agentType === AGENT_TYPES.PLATFORM_SERVICE) {
        try {
          messages = await this.loadLegacyHistory()
        } catch (legacyErr) {}
      }
    }
    if (!messages.length) {
      messages = [{
        id: 'welcome',
        content: this.welcomeMessage(),
        isBot: true,
        status: 'completed',
        timeText: formatDate(new Date(), 'HH:mm')
      }]
    }
    this.setData({
      pageState: 'success',
      messages,
      scrollToView: `msg-${messages[messages.length - 1].id}`
    })
    this.autoSendHandoffMessage()
  },

  autoSendHandoffMessage() {
    if (!this.data.handoffContext || this.data.handoffAutoSent) return
    this.setData({
      handoffAutoSent: true,
      inputText: '我想申请这位匹配对象的官方对接，请协助核对双方意向和见面安排。'
    })
    this.onSend()
  },

  onRetry() {
    this.loadHistory()
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  async sendAgentMessage(text) {
    const sessionId = await this.ensureSession()
    return post(`${API_PATHS.AGENT_SESSIONS}/${sessionId}/messages`, Object.assign({
      content: text,
      message: text,
      agent_type: this.data.agentType
    }, this.data.handoffContext || {}), { showError: false })
  },

  async sendLegacyMessage(text) {
    return post(API_PATHS.CHAT_SEND, Object.assign({ message: text, content: text }, this.data.handoffContext || {}), { showError: false })
  },

  /**
   * Complete-response gate: full API result must yield non-empty content
   * OR a valid normalized patchPreview. No generic fake success copy.
   * Platform service: throw OR empty/malformed primary → legacy (same loader).
   */
  async fetchCompleteAssistantReply(text) {
    let primaryReply
    let primaryError = null
    try {
      primaryReply = await this.sendAgentMessage(text)
    } catch (err) {
      primaryError = err
    }

    const isPlatform = this.data.agentType === AGENT_TYPES.PLATFORM_SERVICE
    const primaryEval = primaryError
      ? { ok: false }
      : evaluateAssistantReply(primaryReply, normalizePatchPreview)

    let legacyReply
    let legacyError = null
    if (isPlatform && !primaryEval.ok) {
      try {
        legacyReply = await this.sendLegacyMessage(text)
      } catch (err) {
        legacyError = err
      }
    }

    return resolveCompleteAssistantReply({
      agentType: this.data.agentType,
      primaryReply,
      primaryError,
      legacyReply,
      legacyError,
      normalizePatchPreview
    })
  },

  async runAssistantTurn({ text, pendingMessageId, requestId, appendUser }) {
    if (!this._pageActive) return
    const startedAt = Date.now()
    this._activeRequestId = requestId

    const pending = createPendingAssistantMessage({
      pendingMessageId,
      requestId,
      agentType: this.data.agentType,
      originalUserText: text,
      timeText: formatDate(new Date(), 'HH:mm')
    })

    const nextMessages = appendUser
      ? [...this.data.messages, {
        id: `u_${requestId}`,
        content: text,
        isBot: false,
        status: 'completed',
        timeText: formatDate(new Date(), 'HH:mm')
      }, pending]
      : (() => {
        const updated = updateMessageById(this.data.messages, pendingMessageId, () => pending)
        return updated.found ? updated.messages : [...this.data.messages, pending]
      })()

    this.safeSetData({
      messages: nextMessages,
      inputText: appendUser ? '' : this.data.inputText,
      sending: true,
      scrollToView: `msg-${pendingMessageId}`
    })
    this.startWaitingCopyRotation(pendingMessageId)

    try {
      const result = await this.fetchCompleteAssistantReply(text)
      if (!this._pageActive || this._activeRequestId !== requestId) return

      const waitMs = elapsedAtLeast(startedAt, MIN_LOADER_MS)
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
      if (!this._pageActive || this._activeRequestId !== requestId) return

      this.clearWaitingTimers()
      const responseMeta = result.reply && typeof result.reply === 'object' ? result.reply : {}
      if (responseMeta.partner_notified === true || responseMeta.cancelled === true || responseMeta.accepted === true) {
        const inquiryStatus = responseMeta.accepted === true
          ? 'accepted'
          : (responseMeta.partner_notified === true ? 'sent' : 'cancelled')
        this.safeSetData({
          messages: this.data.messages.map((item) => (
            item.partnerInquiryPreview
              && (item.partnerInquiryPreview.status === 'pending_confirmation'
                || (responseMeta.accepted === true && item.partnerInquiryPreview.incoming))
              ? Object.assign({}, item, {
                partnerInquiryPreview: Object.assign({}, item.partnerInquiryPreview, { status: inquiryStatus })
              })
              : item
          ))
        })
      }
      const completed = completeAssistantMessage(
        this.data.messages.find((m) => m.id === pendingMessageId) || pending,
        {
          content: result.content,
          patchPreview: result.patchPreview,
          partnerInquiryPreview: normalizePartnerInquiryPreview(result.reply && result.reply.partner_inquiry_preview),
          handoff: result.handoff,
          timeText: formatDate(new Date(), 'HH:mm')
        }
      )
      // Identity-safe replace — never use "last message"
      if (completed.status === 'error') {
        this.replaceMessageById(pendingMessageId, () => completed)
        wx.showToast({ title: completed.errorText || '回复生成失败', icon: 'none', duration: 3000 })
      } else {
        this.replaceMessageById(pendingMessageId, () => completed)
        this.safeSetData({ scrollToView: `msg-${pendingMessageId}` })
      }
    } catch (err) {
      if (!this._pageActive || this._activeRequestId !== requestId) return
      this.clearWaitingTimers()
      const waitMs = elapsedAtLeast(startedAt, MIN_LOADER_MS)
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
      if (!this._pageActive || this._activeRequestId !== requestId) return
      const failed = errorAssistantMessage(
        this.data.messages.find((m) => m.id === pendingMessageId) || pending,
        (err && err.message) || '回复生成失败'
      )
      this.replaceMessageById(pendingMessageId, () => failed)
      this.safeSetData({ scrollToView: `msg-${pendingMessageId}` })
      wx.showToast({ title: failed.errorText, icon: 'none', duration: 3000 })
    } finally {
      if (this._activeRequestId === requestId) {
        this.clearWaitingTimers()
        this.safeSetData({ sending: false })
      }
    }
  },

  async onSend() {
    const text = (this.data.inputText || '').trim()
    if (!text || this.data.sending || this._turnStarting || this.data.coordinatorReadOnly) return
    this._turnStarting = true
    try {
      const app = getApp()
      if (!await app.checkNetwork()) {
        wx.showToast({ title: '网络不可用', icon: 'none' })
        return
      }

      const { requestId, pendingMessageId } = makeIds('b_pending')
      await this.runAssistantTurn({
        text,
        pendingMessageId,
        requestId,
        appendUser: true
      })
    } finally {
      this._turnStarting = false
    }
  },

  async retryAiMessage(e) {
    if (this.data.sending || this._turnStarting || this.data.coordinatorReadOnly) return
    const messageId = String(e.currentTarget.dataset.messageId || '')
    const current = this.data.messages.find((m) => m.id === messageId)
    if (!current || current.status !== 'error') return
    const text = String(current.originalUserText || '').trim()
    if (!text) {
      wx.showToast({ title: '无法重新生成', icon: 'none' })
      return
    }
    this._turnStarting = true
    try {
      const app = getApp()
      if (!await app.checkNetwork()) {
        wx.showToast({ title: '网络不可用', icon: 'none' })
        return
      }

      const requestId = `req_retry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await this.runAssistantTurn({
        text,
        pendingMessageId: messageId,
        requestId,
        appendUser: false
      })
    } finally {
      this._turnStarting = false
    }
  },

  openHumanService(e) {
    const messageId = String(e.currentTarget.dataset.messageId || '')
    const message = this.data.messages.find((item) => item.id === messageId)
    const handoff = message && message.handoff
    if (!handoff || handoff.provider !== 'wecom' || !handoff.corp_id || !handoff.service_url) {
      wx.showToast({ title: '人工客服入口暂未配置', icon: 'none' })
      return
    }
    if (typeof wx.openCustomerServiceChat !== 'function') {
      wx.showToast({ title: '请升级微信后联系人工客服', icon: 'none' })
      return
    }
    wx.openCustomerServiceChat({
      extInfo: { url: handoff.service_url },
      corpId: handoff.corp_id,
      fail: () => wx.showToast({ title: '客服入口打开失败，请稍后重试', icon: 'none' })
    })
  },

  async onConfirmPatch(e) {
    await this.submitPatchAction(e, 'confirm')
  },

  async onCancelPatch(e) {
    await this.submitPatchAction(e, 'cancel')
  },

  onPartnerInquiryAction(e) {
    if (this.data.sending || this._turnStarting || this.data.coordinatorReadOnly) return
    const action = String(e.currentTarget.dataset.action || '')
    const text = action === 'accept' ? '接受这份调整' : (action === 'confirm' ? '确认询问对方' : '暂不询问')
    this.setData({ inputText: text }, () => this.onSend())
  },

  async onSelectPrimaryResolution(e) {
    if (this.data.patchSubmitting) return
    const messageId = String(e.currentTarget.dataset.messageId || '')
    const field = String(e.currentTarget.dataset.field || '')
    const value = String(e.currentTarget.dataset.value || '')
    const date = String(e.currentTarget.dataset.date || '')
    const period = String(e.currentTarget.dataset.period || '')
    const currentMessage = this.data.messages.find((item) => item.id === messageId)
    const currentPreview = currentMessage && currentMessage.patchPreview
    if (!currentPreview || !this.data.coordinationId) {
      wx.showToast({ title: '缺少约会协调信息', icon: 'none' })
      return
    }
    const nextSelection = Object.assign({}, currentPreview.primarySelection || {})
    if (field === 'time') {
      nextSelection.date = date
      nextSelection.period = period
    } else if (field === 'area' && value) {
      nextSelection.area = value
    } else if (field === 'activity' && value) {
      nextSelection.activity = value
    } else {
      return
    }
    this.setData({ patchSubmitting: true })
    try {
      const body = await post(`${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/application-patches`, {
        changes: currentPreview.sourceChanges,
        primary_selection: nextSelection
      }, { showError: false })
      const nextPreview = normalizePatchPreview(body, body && body.status === 'pending_confirmation')
      const messages = this.data.messages.map((item) => {
        if (item.id !== messageId) return item
        return Object.assign({}, item, { patchPreview: nextPreview || item.patchPreview })
      })
      this.setData({ messages })
    } catch (err) {
      this.handlePatchError(err)
    } finally {
      this.setData({ patchSubmitting: false })
    }
  },

  handlePatchError(err) {
    const code = err && (err.code || err.error_code || err.errorCode)
    const message = (err && err.message) || '操作失败，请重试'
    if (code === 'INVITATION_EXPIRED' || /暂未得到回应|邀请已结束/.test(message)) {
      wx.showToast({ title: '本次约会邀请已结束，请查看最新状态。', icon: 'none', duration: 3000 })
      if (this.data.coordinationId) {
        wx.navigateTo({
          url: `/pages/date-coordination/date-coordination?id=${this.data.coordinationId}`
        })
      }
      return
    }
    if (code === 'PRIMARY_RESOLUTION_REQUIRED') {
      wx.showToast({ title: '请先选择本次建议安排', icon: 'none' })
      return
    }
    if (code === 'INVITATION_ALREADY_RESPONDED'
      || code === 'STALE_INVITATION_VERSION'
      || code === 'STALE_COORDINATION_VERSION'
      || /刚刚回应了邀请|刚刚更新了约会安排|协调状态刚刚发生变化|请查看最新/.test(message)) {
      wx.showToast({ title: '协调状态刚刚发生变化，请查看最新进度。', icon: 'none', duration: 3000 })
      if (this.data.coordinationId) {
        wx.navigateTo({
          url: `/pages/date-coordination/date-coordination?id=${this.data.coordinationId}`
        })
      }
      return
    }
    wx.showToast({ title: message, icon: 'none' })
  },

  async submitPatchAction(e, action) {
    const patchId = String(e.currentTarget.dataset.patchId || '')
    const messageId = String(e.currentTarget.dataset.messageId || '')
    if (!patchId || !messageId || this.data.patchSubmitting) return
    if (!this.data.coordinationId) {
      wx.showToast({ title: '缺少约会协调信息', icon: 'none' })
      return
    }
    const currentMessage = this.data.messages.find((item) => item.id === messageId)
    const currentPreview = currentMessage && currentMessage.patchPreview
    const isCreate = currentPreview && currentPreview.operation === 'create'

    this.setData({ patchSubmitting: true })
    try {
      await post(
        `${API_PATHS.DATE_COORDINATIONS}/${this.data.coordinationId}/application-patches/${patchId}/${action}`,
        { patch_id: patchId, patchId },
        { showError: false }
      )
      const nextStatus = action === 'confirm' ? 'applied' : 'cancelled'
      const messages = this.data.messages.map((item) => {
        if (item.id !== messageId || !item.patchPreview) return item
        return Object.assign({}, item, { patchPreview: Object.assign({}, item.patchPreview, { status: nextStatus }) })
      })
      const notice = {
        id: `b_${Date.now()}`,
        content: action === 'confirm'
          ? (isCreate ? '约会申请已发送给对方，正在等待回应。' : '修改已确认，我已更新约会条件并通知对方。')
          : (isCreate ? '好的，这份申请已暂不发送。' : '好的，已暂不修改，原来的约会条件会继续保留。'),
        isBot: true,
        status: 'completed',
        timeText: formatDate(new Date(), 'HH:mm')
      }
      this.setData({ messages: [...messages, notice], scrollToView: `msg-${notice.id}` })
    } catch (err) {
      this.handlePatchError(err)
    } finally {
      this.setData({ patchSubmitting: false })
    }
  }
})
