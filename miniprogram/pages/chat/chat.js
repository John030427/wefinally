const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { formatDate } = require('../../utils/util')

const AGENT_TYPES = {
  PLATFORM_SERVICE: 'platform_service',
  LOVE_ADVISOR: 'love_advisor',
  DATE_COORDINATOR: 'date_coordinator'
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
      flat.push({
        id: `b_${item.id || index}`,
        content: item.ai_content || item.reply || item.content || '已收到您的咨询',
        isBot: true,
        timeText
      })
    }
  })
  return flat
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
    coordinationId: ''
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
      inputText: options.prompt || ''
    })
    wx.setNavigationBarTitle({ title: this.data.agentTitle })
    if (handoffTicketId || matchLogId || matchUserId) {
      this.setData({ handoffContext: {
        handoff_ticket_id: handoffTicketId,
        match_log_id: matchLogId,
        match_user_id: matchUserId
      } })
    }
    this.loadHistory()
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
      const botMsg = { id: `b_${Date.now()}`, content, isBot: true, timeText: formatDate(new Date(), 'HH:mm') }
      this.setData({ messages: [...this.data.messages, botMsg], scrollToView: `msg-${botMsg.id}` })
    } catch (err) {
      wx.showToast({ title: '发送失败，请重试', icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  }
})
