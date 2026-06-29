const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { formatDate } = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    messages: [],
    inputText: '',
    sending: false,
    scrollToView: ''
  },

  onLoad() {
    this.loadHistory()
  },

  async loadHistory() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    try {
      const data = await get(API_PATHS.CHAT_HISTORY, {}, { showError: false })
      const raw = (data && (data.messages || data.list)) || (Array.isArray(data) ? data : [])
      let messages = raw.map((m, i) => ({
        id: m.id || i,
        content: m.ai_content || m.content || m.reply || '',
        userContent: m.user_content || m.question || '',
        isBot: m.role === 'assistant' || m.isBot || !!m.ai_content,
        timeText: formatDate(m.create_time || m.createdAt || m.time, 'HH:mm')
      }))

      if (messages.length === 0) {
        messages = [{
          id: 'welcome',
          content: '您好！我是 WeFinally AI 智能客服，可为您解答会员、匹配、规则、奔现、订单、注销等问题。请问有什么可以帮您？',
          isBot: true,
          timeText: formatDate(new Date(), 'HH:mm')
        }]
      } else {
        const flat = []
        raw.forEach((m, i) => {
          if (m.user_content || m.question) {
            flat.push({
              id: `u_${i}`,
              content: m.user_content || m.question,
              isBot: false,
              timeText: formatDate(m.create_time || m.time, 'HH:mm')
            })
          }
          flat.push({
            id: `b_${i}`,
            content: m.ai_content || m.content || m.reply || '已收到您的咨询',
            isBot: true,
            timeText: formatDate(m.create_time || m.time, 'HH:mm')
          })
        })
        messages = flat.length ? flat : messages
      }

      this.setData({
        pageState: 'success',
        messages,
        scrollToView: `msg-${messages[messages.length - 1].id}`
      })
    } catch (err) {
      this.setData({
        pageState: 'success',
        messages: [{
          id: 'welcome',
          content: '您好！我是 WeFinally AI 智能客服。网络异常，您仍可尝试发送消息。',
          isBot: true,
          timeText: formatDate(new Date(), 'HH:mm')
        }]
      })
    }
  },

  onRetry() {
    this.loadHistory()
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  async onSend() {
    const text = (this.data.inputText || '').trim()
    if (!text || this.data.sending) return

    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    const userMsg = {
      id: `u_${Date.now()}`,
      content: text,
      isBot: false,
      timeText: formatDate(new Date(), 'HH:mm')
    }

    const messages = [...this.data.messages, userMsg]
    this.setData({ messages, inputText: '', sending: true, scrollToView: `msg-${userMsg.id}` })

    try {
      const reply = await post(API_PATHS.CHAT_SEND, { message: text, content: text }, { showError: false })
      const content = (reply && (reply.content || reply.ai_content || reply.answer)) ||
        (typeof reply === 'string' ? reply : '感谢您的咨询，如需人工协助系统将自动转接。')
      const botMsg = {
        id: `b_${Date.now()}`,
        content,
        isBot: true,
        timeText: formatDate(new Date(), 'HH:mm')
      }
      this.setData({
        messages: [...this.data.messages, botMsg],
        scrollToView: `msg-${botMsg.id}`
      })
    } catch (err) {
      wx.showToast({ title: '发送失败，请重试', icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  }
})
