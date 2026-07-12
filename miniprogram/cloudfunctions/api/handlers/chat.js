const { list } = require('../lib/db')
const { currentUser } = require('./user')
const agent = require('./agent')
const { AGENT_TYPES } = require('../agent/types')

async function history(data, wxContext) {
  const user = await currentUser(wxContext)
  const sessions = await list('agent_session', { user_id: user.id, agent_type: AGENT_TYPES.PLATFORM_SERVICE }, 100)
  sessions.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  if (sessions[0]) return agent.messages({ id: sessions[0].id }, wxContext)
  const rows = await list('ai_chat_log', { user_id: user.id }, 50)
  rows.sort((a, b) => {
    const av = new Date(a.create_time || 0).getTime()
    const bv = new Date(b.create_time || 0).getTime()
    return av - bv
  })
  return { messages: rows, list: rows }
}

async function send(data, wxContext) {
  const user = await currentUser(wxContext)
  const content = String(data.message || data.content || '').trim()
  if (!content) throw new Error('请输入内容')
  const handoffTicketId = Number(data.handoff_ticket_id || data.handoffTicketId || 0)
  const matchLogId = Number(data.match_log_id || data.matchLogId || 0)
  const matchUserId = Number(data.match_user_id || data.matchUserId || 0)
  const sessions = await list('agent_session', { user_id: user.id, agent_type: AGENT_TYPES.PLATFORM_SERVICE }, 100)
  sessions.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  const session = sessions[0] || await agent.createSession({ agent_type: AGENT_TYPES.PLATFORM_SERVICE }, wxContext)
  if (handoffTicketId || matchLogId || matchUserId) {
    await agent.createHumanTicket({
      session_id: session.id,
      priority: 'P1',
      category: 'match_handoff',
      summary: '用户从匹配详情发起官方第一次约会对接'
    }, wxContext)
    return {
      reply: '已收到你的官方对接申请，并转交平台客服。双方仍不开放私聊，你也可以在匹配详情中开启结构化的第一次约会协调。',
      content: '已收到你的官方对接申请，并转交平台客服。双方仍不开放私聊，你也可以在匹配详情中开启结构化的第一次约会协调。',
      manual_pending: true
    }
  }
  const result = await agent.send({ session_id: session.id, message: content }, wxContext)
  return Object.assign({}, result, { content: result.reply })
}

module.exports = {
  history,
  send
}
