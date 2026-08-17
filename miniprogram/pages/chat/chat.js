const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { formatDate } = require('../../utils/util')

const AGENT_TYPES = {
  PLATFORM_SERVICE: 'platform_service',
  LOVE_ADVISOR: 'love_advisor',
  DATE_COORDINATOR: 'date_coordinator'
}

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

function normalizePatchPreview(raw, requiresConfirmation) {
  const patch = raw && (raw.patch_preview || raw.patchPreview || raw)
  const preview = patch && patch.preview
  if (!patch || !preview || !Array.isArray(preview.changed_fields)) return null
  return {
    id: String(patch.id || patch.patch_id || ''),
    operation: patch.operation || 'modify',
    status: patch.status || 'pending_confirmation',
    requiresConfirmation: requiresConfirmation === true || patch.requires_confirmation === true || patch.status === 'pending_confirmation',
    changes: preview.changed_fields.map((field) => ({
      field,
      label: PATCH_FIELD_LABELS[field] || '约会条件',
      before: formatPatchValue(preview.before && preview.before[field]),
      after: formatPatchValue(preview.after && preview.after[field])
    })),
    affectsExistingProposal: Boolean(preview.affects_existing_proposal),
    willNotifyPartner: Boolean(preview.will_notify_partner)
  }
}

function assistantMessage(item, index) {
  const patchPreview = normalizePatchPreview(item && item.patch_preview, item && item.requires_confirmation)
  return {
    id: `b_${item.id || index}`,
    content: item.ai_content || item.reply || item.content || '已收到您的咨询',
    isBot: true,
    timeText: formatDate(item.create_time || item.createdAt || item.time, 'HH:mm'),
    patchPreview,
    handoff: item && item.handoff && item.handoff.available ? item.handoff : null
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
    patchSubmitting: false,
    supportCode: '',
    supportCodeState: 'loading',
    supportCodeError: ''
  },

  onLoad(options) {
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
    if (this.data.agentType === AGENT_TYPES.LOVE_ADVISOR) {
      return '你好，我是 WeFinally AI恋爱助手。可以陪你聊沟通、边界和见面准备；信息有限时，我会明确说明知识不足。'
    }
    if (this.data.agentType === AGENT_TYPES.DATE_COORDINATOR) {
      return '你好，我是 WeFinally AI约会协调员。我只会基于当前协调任务的安全摘要解释进度，不会透露对方原始回答。'
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
    this.setData({ sessionId: String(sessionId), sessionReady: true })
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
      messages = [{ id: 'welcome', content: this.welcomeMessage(), isBot: true, timeText: formatDate(new Date(), 'HH:mm') }]
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

  async onSend() {
    const text = (this.data.inputText || '').trim()
    if (!text || this.data.sending) return
    const app = getApp()
    if (!await app.checkNetwork()) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    const userMsg = { id: `u_${Date.now()}`, content: text, isBot: false, timeText: formatDate(new Date(), 'HH:mm') }
    this.setData({ messages: [...this.data.messages, userMsg], inputText: '', sending: true, scrollToView: `msg-${userMsg.id}` })
    try {
      let reply
      try {
        reply = await this.sendAgentMessage(text)
      } catch (err) {
        if (this.data.agentType !== AGENT_TYPES.PLATFORM_SERVICE) throw err
        reply = await this.sendLegacyMessage(text)
      }
      const content = (reply && (reply.reply || reply.content || reply.ai_content || reply.answer || reply.message)) ||
        (typeof reply === 'string' ? reply : '感谢你的咨询，我会在信息范围内尽力协助。')
      const botMsg = Object.assign(assistantMessage(reply || {}, Date.now()), {
        id: `b_${Date.now()}`,
        content,
        timeText: formatDate(new Date(), 'HH:mm')
      })
      this.setData({ messages: [...this.data.messages, botMsg], scrollToView: `msg-${botMsg.id}` })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '发送失败，请重试', icon: 'none', duration: 3000 })
    } finally {
      this.setData({ sending: false })
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
        timeText: formatDate(new Date(), 'HH:mm')
      }
      this.setData({ messages: [...messages, notice], scrollToView: `msg-${notice.id}` })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败，请重试', icon: 'none' })
    } finally {
      this.setData({ patchSubmitting: false })
    }
  }
})
