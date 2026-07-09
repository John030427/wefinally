const { addWithId, list } = require('../lib/db')
const { currentUser } = require('./user')

async function history(data, wxContext) {
  const user = await currentUser(wxContext)
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
  const isHandoff = handoffTicketId || /奔现|对接|见面/.test(content)
  const aiContent = isHandoff
    ? '已收到你的官方奔现对接申请。平台客服会先核对双方意向、见面城市、时间窗口和安全确认信息，再推进下一步；双方仍不开放私聊。'
    : '已收到你的问题。WeFinally 平台客服会围绕注册、匹配、VIP、见面安全与官方奔现对接为你提供帮助。'
  const row = await addWithId('ai_chat_log', {
    user_id: user.id,
    handoff_ticket_id: handoffTicketId || 0,
    match_log_id: matchLogId || 0,
    match_user_id: matchUserId || 0,
    user_content: content,
    ai_content: aiContent,
    is_manual_transfer: isHandoff ? 1 : 0
  }, 'chat')
  return {
    reply: aiContent,
    content: aiContent,
    message: row
  }
}

module.exports = {
  history,
  send
}
