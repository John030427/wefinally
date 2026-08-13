const fs = require('fs')
const http = require('http')
const path = require('path')

const port = Number(process.env.ADMIN_CLOUD_FIXTURE_PORT || 3112)
const htmlPath = path.resolve(__dirname, '../public/admin/index.html')

const official = { id: 7, support_code: 'WF-000007', display_label: 'WF-000007 · 女 · 深圳', gender: 2, gender_text: '女', city: '深圳', is_test: false, status: 1, member_status: 'approved', is_vip: 1, vip_source: 'partner_invite', vip_expire_time: '2027-08-13T00:00:00.000Z', create_time: '2026-08-01T10:00:00.000Z', openid: 'official-openid-7' }
const testUser = { id: 118, support_code: 'TEST-000118', display_label: 'TEST-000118 · 男 · 汕头', gender: 1, gender_text: '男', city: '汕头', is_test: true, status: 1, member_status: 'approved', is_vip: 1, vip_source: 'internal_test', create_time: '2026-08-12T10:00:00.000Z', openid: 'dev_wefinally_local_openid' }

const conversations = [
  { id: 301, session_ref: 'WF-S-000301', user_ref: 'WF-000007', user: official, agent_type: 'match_advisor', status: 'active', summary: '询问本周匹配建议', create_time: '2026-08-13T09:00:00.000Z' },
  { id: 302, session_ref: 'WF-S-000302', user_ref: 'WF-000007', user: official, agent_type: 'platform_service', status: 'active', summary: '询问会员权益', create_time: '2026-08-13T09:10:00.000Z' },
  { id: 303, session_ref: 'WF-S-000303', user_ref: 'WF-000007', user: official, agent_type: 'date_coordinator', status: 'active', summary: '协调周末见面', coordination_ref: 'WF-D-000401', create_time: '2026-08-13T09:20:00.000Z' },
  { id: 318, session_ref: 'WF-S-000318', user_ref: 'TEST-000118', user: testUser, agent_type: 'match_advisor', status: 'active', summary: '不可约会测试案例', create_time: '2026-08-13T09:30:00.000Z' }
]

const messages = new Map(conversations.map((item) => [item.id, [
  { message_ref: `WF-M-${item.id}01`, source_type: 'message', role: 'user', sender_type: 'user', content: item.id === 318 ? '这是测试账号，不允许约会。' : '请帮我看看最近的业务记录。', create_time: item.create_time },
  { message_ref: `WF-M-${item.id}02`, source_type: 'message', role: 'assistant', sender_type: 'agent', content: '已整理资料并等待人工客服确认。', create_time: '2026-08-13T09:31:00.000Z' }
]]))

const tickets = [{ id: 501, ticket_ref: 'WF-T-000501', session_ref: 'WF-S-000301', user_ref: 'WF-000007', user: official, priority: 'P2', category: 'match', summary: '匹配记录说明', status: 'processing', assigned_admin_ref: 'WF-A-000001', create_time: '2026-08-13T09:35:00.000Z' }]

const order = { id: 601, order_no: 'WF-ORDER-000601', user: official, amount: 199, pay_status: 1, settle_status: 0, pay_time: '2026-08-12T08:00:00.000Z', create_time: '2026-08-12T07:55:00.000Z' }
const match = { id: 701, owner: official, matched: { ...official, id: 8, support_code: 'WF-000008', display_label: 'WF-000008 · 男 · 潮州', gender: 1, gender_text: '男', city: '潮州' }, total_score: 86.5, view_similarity: 91, match_date: '2026-08-13', match_type: 'daily', score_version: 'v2' }

function aggregate(user = official) {
  return {
    user,
    match_settings: { age_min: 28, age_max: 38, min_education: '本科', self_view_text: '重视诚信和家庭责任', target_view_text: '沟通坦诚、尊重边界' },
    member_application: { id: 801, status: 'approved' },
    attribution: { source: 'partner_share', promote_code: 'GRACE2026' },
    partner: { id: 1, name: 'Grace', promote_code: 'GRACE2026' },
    orders: user.is_test ? [] : [order],
    matches: user.is_test ? [] : [match],
    conversations: conversations.filter((item) => item.user.id === user.id).map(({ user: ignored, ...item }) => item),
    tickets: user.is_test ? [] : [{ id: 501, category: 'match', summary: '匹配记录说明', status: 'processing' }],
    coordinations: user.is_test ? [] : [{ id: 401, status: 'arranged' }],
    notification_jobs: user.is_test ? [] : [{ id: 901, stage: 'proposal_generated', status: 'sent', sent_at: '2026-08-13T09:25:00.000Z' }],
    sensitive_fields_included: true
  }
}

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' })
  res.end(type.startsWith('application/json') ? JSON.stringify(payload) : payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) } })
    req.on('error', reject)
  })
}

function listPayload(list, pageSize = 20) {
  return { list, total: list.length, page: 1, pageSize }
}

function conversationDetail(session) {
  return {
    read_only: true,
    session,
    messages: messages.get(session.id) || [],
    timeline: messages.get(session.id) || [],
    coordination: session.coordination_ref ? { coordination_ref: session.coordination_ref, participant_refs: ['WF-000007', 'WF-000008'], status: 'arranged', coordination_version: 1, missing_dimensions: [] } : null,
    runs: [{ run_ref: 'WF-R-000001', provider: 'deepseek', status: 'completed' }],
    notification_jobs: [{ job_ref: 'WF-N-000901', stage: 'proposal_generated', status: 'sent' }],
    user_context: aggregate(session.user)
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const html = fs.readFileSync(htmlPath, 'utf8').replace('<script>', `<script>window.WF_CLOUD_ONLY = true; window.WF_CLOUD_BACKOFFICE_API = 'http://127.0.0.1:${port}';</script><script>`)
    return send(res, 200, html, 'text/html; charset=utf-8')
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/admin-login') return send(res, 200, { code: 0, data: { token: 'fixture-token', admin: { username: 'Grace', role: 'super_admin', admin_role: 'super_admin' } } })
  if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') return send(res, 200, { code: 0, data: { users: 1, vip_users: 1, partners: 1, paid_orders: 1, revenue: 199, pending_member_applications: 0, open_service_tickets: 1 } })
  if (req.method === 'GET' && url.pathname === '/api/admin/users') return send(res, 200, { code: 0, data: listPayload(url.searchParams.get('include_test') === '1' ? [official, testUser] : [official]) })
  if (req.method === 'GET' && url.pathname === '/api/admin/orders') return send(res, 200, { code: 0, data: listPayload([order], 50) })
  if (req.method === 'GET' && url.pathname === '/api/admin/matches') return send(res, 200, { code: 0, data: listPayload([match], 50) })
  if (req.method === 'GET' && url.pathname === '/api/admin/agent/tickets') return send(res, 200, { code: 0, data: { list: tickets } })
  if (req.method === 'GET' && url.pathname === '/api/admin/date-coordinations') return send(res, 200, { code: 0, data: { list: [{ id: 401, status: 'arranged' }] } })
  if (req.method === 'GET' && url.pathname === '/api/admin/agent/conversations') {
    let list = url.searchParams.get('include_test') === '1' ? conversations : conversations.filter((item) => !item.user.is_test)
    const query = String(url.searchParams.get('query') || '').toLowerCase()
    if (query) list = list.filter((item) => [item.session_ref, item.user_ref, item.user.display_label, item.summary].join(' ').toLowerCase().includes(query))
    return send(res, 200, { code: 0, data: { list } })
  }
  let matched = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/)
  if (req.method === 'GET' && matched) {
    const user = Number(matched[1]) === 118 ? testUser : Number(matched[1]) === 7 ? official : null
    return send(res, user ? 200 : 404, user ? { code: 0, data: aggregate(user) } : { code: 404, message: 'fixture user not found' })
  }
  matched = url.pathname.match(/^\/api\/admin\/matches\/(\d+)$/)
  if (req.method === 'GET' && matched) return send(res, 200, { code: 0, data: { log: match, owner: { ...official, match_settings: aggregate().match_settings }, partner: { ...match.matched, match_settings: aggregate().match_settings }, score_detail: { version: 'v2', quality_gate: { pass: true, reasons: [] }, side: { dimensions: {} } } } })
  matched = url.pathname.match(/^\/api\/admin\/agent\/conversations\/(\d+)$/)
  if (req.method === 'GET' && matched) {
    const session = conversations.find((item) => item.id === Number(matched[1]))
    return send(res, session ? 200 : 404, session ? { code: 0, data: conversationDetail(session) } : { code: 404, message: 'fixture conversation not found' })
  }
  matched = url.pathname.match(/^\/api\/admin\/agent\/conversations\/(\d+)\/reply$/)
  if (req.method === 'POST' && matched) {
    const session = conversations.find((item) => item.id === Number(matched[1]))
    const body = await readBody(req)
    if (!session) return send(res, 404, { code: 404, message: 'fixture conversation not found' })
    messages.get(session.id).push({ message_ref: `WF-M-${Date.now()}`, source_type: 'message', role: 'assistant', sender_type: 'human_agent', content: String(body.content || ''), create_time: new Date().toISOString() })
    return send(res, 200, { code: 0, data: { created: false, ticket: tickets[0] } })
  }
  return send(res, 404, { code: 404, message: `fixture route not found: ${req.method} ${url.pathname}` })
}).listen(port, '127.0.0.1', () => console.log(`admin cloud browser fixture listening on ${port}`))
