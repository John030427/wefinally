const assert = require('assert')
const { createAgentBackofficeService } = require('../../miniprogram/cloudfunctions/api/agent/backofficeService')
const { createUserBackofficeService } = require('../../miniprogram/cloudfunctions/api/agent/userBackofficeService')

function fakeDeps() {
  const tables = {
    user: [
      { _id: 'user_7', id: 7, support_code: 'WF-000007', openid: 'official-openid', phone: '13800000007', gender: 2, city: '深圳', status: 1, is_vip: 1 },
      { _id: 'users_118', id: 118, openid: 'dev_wefinally_local_openid', gender: 1, city: '深圳', status: 1 }
    ],
    user_match_setting: [{ id: 5, user_id: 7, self_view_text: '重视沟通', target_view_text: '真诚稳定' }],
    user_match_log: [],
    user_order: [{ id: 6, user_id: 7, order_no: 'PRIVATE-ORDER', price: 188, pay_status: 1 }],
    member_application: [{ id: 7, user_id: 7, status: 'approved' }],
    partner: [],
    partner_referral_attribution: [],
    agent_session: [
      { id: 10, user_id: 7, agent_type: 'date_coordinator', status: 'active', summary: '第一次协调' },
      { id: 11, user_id: 7, agent_type: 'platform_service', status: 'manual_pending', summary: '客服咨询' },
      { id: 12, user_id: 7, agent_type: 'love_advisor', status: 'active', summary: '情感咨询' },
      { id: 13, user_id: 118, agent_type: 'date_coordinator', status: 'active', summary: '旧本地测试会话' }
    ],
    agent_message: [
      { id: 20, session_id: 11, user_id: 7, role: 'user', sender_type: 'user', content: '我的订单有问题', create_time: new Date('2026-08-13T08:00:00.000Z') }
    ],
    agent_run: [],
    agent_human_ticket: [
      { id: 30, session_id: 11, user_id: 7, priority: 'P1', category: 'payment', status: 'open', summary: '订单问题' },
      { id: 31, session_id: 13, user_id: 118, priority: 'P2', category: 'test', status: 'open', summary: '测试问题' }
    ],
    agent_notification_job: [],
    date_coordination_event: [],
    date_coordination: [],
    knowledge_article: [],
    partner_user_audit_log: []
  }
  let id = 100
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    tables,
    now: () => new Date('2026-08-13T08:30:00.000Z'),
    async list(name, query, limit) { return (tables[name] || []).filter((row) => matches(row, query)).slice(0, limit || 100) },
    async first(name, query) { return (tables[name] || []).find((row) => matches(row, query)) || null },
    async byId(name, value) { return (tables[name] || []).find((row) => Number(row.id) === Number(value)) || null },
    async addWithId(name, data) {
      const row = { id: ++id, ...data, create_time: deps.now(), update_time: deps.now() }
      tables[name].push(row)
      return row
    },
    async updateByDoc(name, doc, data) { Object.assign(doc, data, { update_time: deps.now() }); return doc },
    async ensureUserSupportCode(user) { return user.support_code }
  }
  return deps
}

async function main() {
  const deps = fakeDeps()
  const userBackoffice = createUserBackofficeService(deps)
  const service = createAgentBackofficeService(deps, { userBackoffice })
  const customerService = { role: 'admin', admin_role: 'customer_service', id: 2 }
  const superAdmin = { role: 'admin', admin_role: 'super_admin', id: 1 }

  const conversations = await service.listConversations(customerService, {})
  assert.strictEqual(conversations.length, 3)
  assert.deepStrictEqual(conversations.map((row) => row.user.support_code), ['WF-000007', 'WF-000007', 'WF-000007'])
  assert.strictEqual(conversations.every((row) => row.user.display_label === 'WF-000007 · 女 · 深圳'), true)
  assert.strictEqual(conversations.some((row) => row.user.is_test), false)
  assert.strictEqual(conversations[0].user_ref, 'WF-000007')

  const withTests = await service.listConversations(superAdmin, { include_test: '1' })
  assert.strictEqual(withTests.length, 4)
  assert.strictEqual(withTests[0].user.support_code, 'TEST-000118')
  assert.strictEqual(withTests[0].user.is_test, true)

  const searched = await service.listConversations(superAdmin, { include_test: '1', query: 'TEST-000118' })
  assert.deepStrictEqual(searched.map((row) => row.session_ref), ['WF-S-000013'])

  const tickets = await service.listTickets(customerService, {})
  assert.strictEqual(tickets.length, 1)
  assert.strictEqual(tickets[0].user.support_code, 'WF-000007')
  const ticketsWithTests = await service.listTickets(superAdmin, { include_test: true })
  assert.strictEqual(ticketsWithTests.length, 2)
  assert.strictEqual(ticketsWithTests[0].user.support_code, 'TEST-000118')

  const detail = await service.conversationDetail(customerService, 11)
  assert.strictEqual(detail.session.user_ref, 'WF-000007')
  assert.strictEqual(detail.user_context.user.support_code, 'WF-000007')
  assert.strictEqual(detail.user_context.user.openid, undefined)
  assert.strictEqual(detail.user_context.orders[0].order_no, undefined)
  assert.strictEqual(detail.user_context.conversations.length, 3)
  assert.deepStrictEqual(
    deps.tables.partner_user_audit_log.slice(-2).map((row) => row.action),
    ['view_agent_conversation', 'view_user_service_context']
  )
  assert.strictEqual(deps.tables.partner_user_audit_log.some((row) => Object.prototype.hasOwnProperty.call(row, 'message_content')), false)

  const ticket = await service.ticketDetail(superAdmin, 30)
  assert.strictEqual(ticket.ticket.user_ref, 'WF-000007')
  assert.strictEqual(ticket.user_context.user.openid, 'official-openid')
  assert.strictEqual(ticket.user_context.orders[0].order_no, 'PRIVATE-ORDER')

  console.log('PASS admin customer records use consolidated user context')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
