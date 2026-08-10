const fs = require('fs')
const http = require('http')
const path = require('path')

const port = Number(process.env.SERVICE_BROWSER_FIXTURE_PORT || 3102)
const htmlPath = path.resolve(__dirname, '../public/admin/index.html')

const tickets = [
  { id: 100, ticket_ref: 'WF-CASE-0716', session_ref: 'WF-S-1784103354687229', user_ref: '霞姐（本地夹具）', coordination_ref: 'WF-D-1784103328942102', priority: 'P2', category: 'date_coordination', summary: '霞姐 / Benson 协调验收夹具：双方完成表单与方案确认，当前业务状态为 arranged。', status: 'resolved', assigned_admin_ref: 'WF-A-OPS', last_reply_at: new Date().toISOString(), create_time: '2026-07-16T12:00:00.000Z' },
  { id: 101, ticket_ref: 'WF-T-000101', session_ref: 'WF-S-000201', user_ref: 'WF-U-000301', coordination_ref: 'WF-D-000401', priority: 'P0', category: 'safety', summary: '用户反馈约会现场存在安全风险，需要立即人工确认。', status: 'open', handoff_status: 'internal_pending', create_time: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: 102, ticket_ref: 'WF-T-000102', session_ref: 'WF-S-000202', user_ref: 'WF-U-000302', coordination_ref: '', priority: 'P1', category: 'payment', summary: '用户认为会员订单可能重复扣费。', status: 'processing', assigned_admin_ref: 'WF-A-000002', last_reply_at: new Date().toISOString(), create_time: new Date(Date.now() - 20 * 60000).toISOString() },
  { id: 103, ticket_ref: 'WF-T-000103', session_ref: 'WF-S-000203', user_ref: 'WF-U-000303', coordination_ref: '', priority: 'P2', category: 'match', summary: '用户对本轮匹配结果提出申诉，希望了解匹配依据。', status: 'closed', assigned_admin_ref: 'WF-A-000002', create_time: new Date(Date.now() - 180 * 60000).toISOString() }
]

const messages = {
  100: [
    { message_ref: 'WF-E-071601', role: 'assistant', sender_type: 'system', content: '脱敏业务事件：发起方表单已提交。', create_time: '2026-07-16T12:01:00.000Z' },
    { message_ref: 'WF-E-071602', role: 'assistant', sender_type: 'system', content: '脱敏业务事件：受邀方接受邀请并提交表单，系统开始计算双方交集。', create_time: '2026-07-16T12:05:00.000Z' },
    { message_ref: 'WF-E-071603', role: 'assistant', sender_type: 'agent', content: '找到双方都可以接受的候选：2026年7月18日下午，福田区，咖啡，AA，约1小时。', create_time: '2026-07-16T12:06:00.000Z' },
    { message_ref: 'WF-E-071604', role: 'assistant', sender_type: 'system', content: '脱敏业务事件：proposal_generated 通知已发送给发起方。', create_time: '2026-07-16T12:07:00.000Z' },
    { message_ref: 'WF-E-071605', role: 'assistant', sender_type: 'human_agent', content: '生产验收完成：双方依次确认同一方案，协调状态进入 arranged。', create_time: '2026-07-16T12:10:00.000Z' }
  ],
  101: [
    { message_ref: 'WF-M-000501', role: 'user', sender_type: 'user', content: '对方临时要求去偏僻的地方，我现在不太放心。', create_time: new Date(Date.now() - 9 * 60000).toISOString() },
    { message_ref: 'WF-M-000502', role: 'assistant', sender_type: 'agent', content: '安全最重要，请不要前往陌生或偏僻地点。我已经暂停自动协调并转接人工客服。', create_time: new Date(Date.now() - 8 * 60000).toISOString() }
  ],
  102: [
    { message_ref: 'WF-M-000503', role: 'user', sender_type: 'user', content: '为什么我的会员订单像是扣了两次？', create_time: new Date(Date.now() - 22 * 60000).toISOString() },
    { message_ref: 'WF-M-000504', role: 'assistant', sender_type: 'agent', content: '我无法直接确认支付结果，已经为你创建人工工单。', create_time: new Date(Date.now() - 21 * 60000).toISOString() },
    { message_ref: 'WF-M-000505', role: 'assistant', sender_type: 'human_agent', content: '已经收到，我正在核对支付回调和订单记录。', create_time: new Date(Date.now() - 5 * 60000).toISOString() }
  ]
}

const conversations = [
  { id: 201, session_ref: 'WF-S-1784103354687229', user_ref: '霞姐（本地夹具）', coordination_ref: 'WF-D-1784103328942102', agent_type: 'date_coordinator', status: 'active', summary: '发起方统一时间线验收：用户、AI、自动通知与业务事件' },
  { id: 202, session_ref: 'WF-S-1784214793323639', user_ref: 'Benson（本地夹具）', coordination_ref: 'WF-D-1784103328942102', agent_type: 'date_coordinator', status: 'active', summary: '受邀方统一时间线验收：用户、AI、自动通知与业务事件' }
]

const conversationMessages = {
  201: [
    { message_ref: 'WF-M-201000', source_type: 'message', role: 'assistant', sender_type: 'agent', content: '我会分别收集双方的时间、区域和活动偏好，再给出双方都能接受的方案。', create_time: '2026-07-16T12:00:00.000Z' },
    { message_ref: 'WF-M-201001', role: 'user', sender_type: 'user', content: '我周六下午有时间，地点希望在福田，第一次见面喝咖啡就好。', create_time: '2026-07-16T12:01:00.000Z' },
    { message_ref: 'WF-M-201002', role: 'assistant', sender_type: 'agent', content: '收到。我会只用这些约会偏好与另一方协调，不会向对方展示你的原始聊天。', create_time: '2026-07-16T12:02:00.000Z' },
    { message_ref: 'WF-M-201003', role: 'user', sender_type: 'user', content: '时间控制在一个小时左右，费用AA。', create_time: '2026-07-16T12:03:00.000Z' },
    { message_ref: 'WF-M-201004', source_type: 'message', notification_job_ref: 'WF-N-201004', role: 'assistant', sender_type: 'agent', content: '对方已确认参与并提交了约会偏好。已找到双方都合适的方案，请打开约会协调页确认。', create_time: '2026-07-16T12:06:00.000Z' }
  ],
  202: [
    { message_ref: 'WF-M-202001', source_type: 'message', notification_job_ref: 'WF-N-202001', role: 'assistant', sender_type: 'agent', content: '你收到一条约会协调邀请，请打开约会协调页查看并决定是否参与。', create_time: '2026-07-16T12:04:00.000Z' },
    { message_ref: 'WF-M-202002', role: 'user', sender_type: 'user', content: '周六下午可以，福田喝咖啡没问题，AA也可以。', create_time: '2026-07-16T12:05:00.000Z' },
    { message_ref: 'WF-M-202003', source_type: 'message', notification_job_ref: 'WF-N-202003', role: 'assistant', sender_type: 'agent', content: '新的约会候选方案已生成，请打开约会协调页查看并确认。', create_time: '2026-07-16T12:07:00.000Z' }
  ]
}

function conversationDetailFor(id) {
  const session = conversations.find((item) => item.id === id)
  if (!session) return null
  return {
    read_only: true,
    session,
    messages: conversationMessages[id] || [],
    timeline: (conversationMessages[id] || []).concat([
      { source_type: 'coordination_event', event_ref: 'WF-E-071601', role: 'assistant', sender_type: 'system', event_type: 'application_sent', content: '约会申请已提交，系统开始等待另一方回应。', create_time: '2026-07-16T12:03:30.000Z' },
      { source_type: 'coordination_event', event_ref: 'WF-E-071602', role: 'assistant', sender_type: 'system', event_type: 'coordination_arranged', content: '双方已确认同一方案，协调状态已完成。', create_time: '2026-07-16T12:10:00.000Z' }
    ]).sort((a, b) => new Date(a.create_time) - new Date(b.create_time)),
    coordination: { coordination_ref: session.coordination_ref, participant_refs: ['霞姐（本地夹具）', 'Benson（本地夹具）'], status: 'arranged', coordination_version: 1, recoordination_count: 0, missing_dimensions: [] },
    runs: [{ run_ref: 'WF-R-1784208000000001', provider: 'deepseek', status: 'completed', error_code: '', create_time: '2026-07-16T12:06:00.000Z' }],
    notification_jobs: [{ job_ref: 'WF-N-1784208000000001', stage: 'proposal_generated', status: 'sent', attempts: 0, error_code: '', create_time: '2026-07-16T12:07:00.000Z' }]
  }
}

function detailFor(id) {
  const ticket = tickets.find((item) => item.id === id)
  if (!ticket) return null
  return {
    ticket,
    session: { session_ref: ticket.session_ref, user_ref: ticket.user_ref, coordination_ref: ticket.coordination_ref, agent_type: ticket.coordination_ref ? 'date_coordinator' : 'platform_service', status: id === 100 ? 'active' : (ticket.status === 'closed' ? 'closed' : 'manual_pending'), summary: ticket.summary },
    messages: messages[id] || [],
    coordination: ticket.coordination_ref ? (id === 100
      ? { coordination_ref: ticket.coordination_ref, participant_refs: ['霞姐（脱敏）', 'Benson（脱敏）'], status: 'arranged', coordination_version: 1, recoordination_count: 0, missing_dimensions: [] }
      : { coordination_ref: ticket.coordination_ref, participant_refs: [ticket.user_ref, 'WF-U-000399'], status: 'manual_handoff', coordination_version: 3, recoordination_count: 2, missing_dimensions: ['meeting_location'] }) : null,
    runs: [{ run_ref: 'WF-R-000601', provider: 'deepseek', status: 'completed', error_code: '', create_time: new Date().toISOString() }],
    notification_jobs: ticket.coordination_ref ? [{ job_ref: id === 100 ? 'WF-N-0716' : 'WF-N-000701', stage: id === 100 ? 'proposal_generated' : 'partner_preference_changed', status: 'sent', attempts: id === 100 ? 0 : 1, error_code: '', create_time: new Date().toISOString() }] : []
  }
}

function send(res, statusCode, payload, type = 'application/json; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': type, 'access-control-allow-origin': '*' })
  res.end(type.startsWith('application/json') ? JSON.stringify(payload) : payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const html = fs.readFileSync(htmlPath, 'utf8').replace('<script>', `<script>window.WF_CLOUD_BACKOFFICE_API = 'http://127.0.0.1:${port}';</script><script>`)
    return send(res, 200, html, 'text/html; charset=utf-8')
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/admin-login') {
    return send(res, 200, { code: 0, data: { token: 'fixture-token', admin: { username: '客服演示', role: 'customer_service', admin_role: 'customer_service' } } })
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/agent/tickets') {
    return send(res, 200, { code: 0, data: { list: tickets } })
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/agent/conversations') {
    const coordinationRef = url.searchParams.get('coordination_ref')
    const sessionRef = url.searchParams.get('session_ref')
    const userRef = url.searchParams.get('user_ref')
    const query = String(url.searchParams.get('query') || '').toLowerCase()
    const list = conversations.filter((item) => (!coordinationRef || item.coordination_ref === coordinationRef)
      && (!sessionRef || item.session_ref === sessionRef)
      && (!userRef || item.user_ref === userRef)
      && (!query || Object.values(item).join(' ').toLowerCase().includes(query)))
    return send(res, 200, { code: 0, data: { list } })
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/date-coordinations') {
    return send(res, 200, { code: 0, data: { list: [detailFor(101).coordination] } })
  }
  let matched = url.pathname.match(/^\/api\/admin\/agent\/tickets\/(\d+)$/)
  if (req.method === 'GET' && matched) {
    const detail = detailFor(Number(matched[1]))
    return send(res, detail ? 200 : 404, detail ? { code: 0, data: detail } : { code: 404, message: 'fixture ticket not found' })
  }
  matched = url.pathname.match(/^\/api\/admin\/agent\/conversations\/(\d+)$/)
  if (req.method === 'GET' && matched) {
    const detail = conversationDetailFor(Number(matched[1]))
    return send(res, detail ? 200 : 404, detail ? { code: 0, data: detail } : { code: 404, message: 'fixture conversation not found' })
  }
  matched = url.pathname.match(/^\/api\/admin\/agent\/conversations\/(\d+)\/reply$/)
  if (req.method === 'POST' && matched) {
    const sessionId = Number(matched[1])
    const session = conversations.find((item) => item.id === sessionId)
    if (!session) return send(res, 404, { code: 404, message: 'fixture conversation not found' })
    const body = await readBody(req)
    let ticket = tickets.find((item) => item.session_ref === session.session_ref && item.status !== 'closed')
    const created = !ticket
    if (!ticket) {
      const id = Math.max(...tickets.map((item) => item.id)) + 1
      ticket = { id, ticket_ref: `WF-T-${String(id).padStart(6, '0')}`, session_ref: session.session_ref, user_ref: session.user_ref, coordination_ref: session.coordination_ref, priority: 'P2', category: 'user_request', summary: '管理员从会话工作台发起人工处理', status: 'processing', assigned_admin_ref: 'WF-A-000002', last_reply_at: new Date().toISOString(), create_time: new Date().toISOString() }
      tickets.push(ticket)
    } else {
      ticket.status = 'processing'
      ticket.assigned_admin_ref = 'WF-A-000002'
      ticket.last_reply_at = new Date().toISOString()
    }
    conversationMessages[sessionId] = conversationMessages[sessionId] || []
    conversationMessages[sessionId].push({ message_ref: `WF-M-${String(Date.now()).slice(-6)}`, source_type: 'message', role: 'assistant', sender_type: 'human_agent', content: String(body.content || ''), create_time: new Date().toISOString() })
    return send(res, 200, { code: 0, data: { created, ticket } })
  }
  matched = url.pathname.match(/^\/api\/admin\/agent\/tickets\/(\d+)\/reply$/)
  if (req.method === 'POST' && matched) {
    const id = Number(matched[1])
    const body = await readBody(req)
    messages[id] = messages[id] || []
    messages[id].push({ message_ref: `WF-M-${String(Date.now()).slice(-6)}`, role: 'assistant', sender_type: 'human_agent', content: String(body.content || ''), create_time: new Date().toISOString() })
    const ticket = tickets.find((item) => item.id === id)
    if (ticket) { ticket.status = 'processing'; ticket.assigned_admin_ref = 'WF-A-000002'; ticket.last_reply_at = new Date().toISOString() }
    return send(res, 200, { code: 0, data: ticket })
  }
  matched = url.pathname.match(/^\/api\/admin\/agent\/tickets\/(\d+)\/close$/)
  if (req.method === 'POST' && matched) {
    const ticket = tickets.find((item) => item.id === Number(matched[1]))
    if (ticket) ticket.status = 'closed'
    return send(res, 200, { code: 0, data: ticket })
  }
  return send(res, 404, { code: 404, message: 'fixture route not found' })
}).listen(port, '127.0.0.1', () => {
  console.log(`customer service browser fixture listening on ${port}`)
})
