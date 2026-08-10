const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { createAgentBackofficeService } = require('../../miniprogram/cloudfunctions/api/agent/backofficeService')

function fakeDeps() {
  const tables = {
    agent_human_ticket: [{ id: 1, session_id: 10, user_id: 7, coordination_id: 30, priority: 'P1', category: 'privacy', summary: '隐私问题', status: 'open' }],
    agent_session: [
      { id: 10, user_id: 7, coordination_id: 30, agent_type: 'date_coordinator', status: 'active', summary: '发起方会话' },
      { id: 11, user_id: 8, coordination_id: 30, agent_type: 'date_coordinator', status: 'active', summary: '受邀方会话' }
    ],
    agent_message: [
      { id: 21, session_id: 10, user_id: 7, role: 'user', sender_type: 'user', content: '我想投诉重复扣费', create_time: new Date('2026-07-12T11:58:00.000Z') },
      { id: 22, session_id: 10, user_id: 7, role: 'assistant', sender_type: 'agent', notification_job_id: 51, content: '已为你转接人工客服。', create_time: new Date('2026-07-12T11:59:00.000Z') },
      { id: 23, session_id: 11, user_id: 8, role: 'user', sender_type: 'user', content: '周六下午我可以。', create_time: new Date('2026-07-12T12:01:00.000Z') }
    ],
    agent_run: [{ id: 41, session_id: 10, provider: 'deepseek', status: 'completed', error_code: '', create_time: new Date('2026-07-12T11:59:00.000Z') }],
    agent_notification_job: [{ id: 51, coordination_id: 30, user_id: 7, stage: 'proposal_generated', status: 'sent', attempts: 1, create_time: new Date('2026-07-12T11:57:00.000Z') }],
    date_coordination_event: [{ id: 61, coordination_id: 30, coordination_version: 2, event_type: 'application_sent', actor_user_id: 7, create_time: new Date('2026-07-12T11:56:00.000Z') }],
    knowledge_article: [],
    date_coordination: [{ id: 30, user_a_id: 7, user_b_id: 8, status: 'no_overlap', coordination_version: 2, recoordination_count: 1 }],
    partner_user_audit_log: []
  }
  let id = 100
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    tables,
    now: () => new Date('2026-07-12T12:00:00.000Z'),
    async list(name, query) { return (tables[name] || []).filter((row) => matches(row, query)) },
    async first(name, query) { return (tables[name] || []).find((row) => matches(row, query)) || null },
    async byId(name, value) { return (tables[name] || []).find((row) => Number(row.id) === Number(value)) || null },
    async addWithId(name, data) {
      const row = { id: ++id, ...data, create_time: deps.now(), update_time: deps.now() }
      tables[name].push(row)
      return row
    },
    async updateByDoc(name, doc, data) { Object.assign(doc, data, { update_time: deps.now() }); return doc }
  }
  return deps
}

async function main() {
  const deps = fakeDeps()
  const service = createAgentBackofficeService(deps)
  const customerService = { role: 'admin', admin_role: 'customer_service', id: 2 }
  const auditor = { role: 'admin', admin_role: 'auditor', id: 3 }
  const superAdmin = { role: 'admin', admin_role: 'super_admin', id: 1 }

  const tickets = await service.listTickets(customerService, {})
  assert.strictEqual(tickets.length, 1)
  assert.strictEqual(tickets[0].user_ref, 'WF-U-000007')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(tickets[0], 'user_id'), false)

  const detail = await service.ticketDetail(customerService, 1)
  assert.strictEqual(detail.ticket.ticket_ref, 'WF-T-000001')
  assert.strictEqual(detail.session.session_ref, 'WF-S-000010')
  assert.strictEqual(detail.messages.length, 2)
  assert.strictEqual(detail.messages[0].content, '我想投诉重复扣费')
  assert.strictEqual(detail.coordination.coordination_ref, 'WF-D-000030')
  assert.strictEqual(detail.runs[0].run_ref, 'WF-R-000041')
  assert.strictEqual(detail.notification_jobs[0].job_ref, 'WF-N-000051')
  assert.strictEqual(detail.timeline.length, 3)
  assert.strictEqual(detail.timeline[0].event_type, 'application_sent')
  assert.strictEqual(detail.timeline.filter((item) => item.source_type === 'notification').length, 0)
  assert.strictEqual(detail.timeline.filter((item) => item.source_type === 'message').length, 2)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(detail.session, 'user_id'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(detail.messages[0], 'user_id'), false)

  const conversations = await service.listConversations(superAdmin, { coordination_ref: 'WF-D-000030' })
  assert.strictEqual(conversations.length, 2)
  assert.strictEqual(conversations[0].coordination_ref, 'WF-D-000030')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(conversations[0], 'user_id'), false)

  const conversation = await service.conversationDetail(superAdmin, 11)
  assert.strictEqual(conversation.session.session_ref, 'WF-S-000011')
  assert.strictEqual(conversation.messages[0].content, '周六下午我可以。')
  assert.strictEqual(conversation.timeline.some((item) => item.event_type === 'application_sent'), true)
  assert.strictEqual(conversation.read_only, true)
  assert.strictEqual(deps.tables.partner_user_audit_log.at(-1).action, 'view_agent_conversation')
  assert.strictEqual(deps.tables.partner_user_audit_log.at(-1).session_id, 11)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(deps.tables.partner_user_audit_log.at(-1), 'message_content'), false)

  const repliedConversation = await service.replyConversation(superAdmin, 11, '我已看到完整记录，现在帮你处理。')
  assert.strictEqual(repliedConversation.created, true)
  assert.strictEqual(repliedConversation.ticket.session_ref, 'WF-S-000011')
  assert.strictEqual(deps.tables.agent_human_ticket.length, 2)
  assert.strictEqual(deps.tables.agent_message.at(-1).sender_type, 'human_agent')
  assert.strictEqual(deps.tables.agent_message.at(-1).session_id, 11)

  await service.replyTicket(customerService, 1, '已收到，我来协助处理。')
  const humanReply = deps.tables.agent_message[deps.tables.agent_message.length - 1]
  assert.strictEqual(humanReply.sender_type, 'human_agent')
  assert.strictEqual(humanReply.session_id, 10)
  assert.strictEqual(deps.tables.agent_human_ticket[0].status, 'processing')

  await service.closeTicket(customerService, 1, { resume_agent: true, note: '问题已处理' })
  assert.strictEqual(deps.tables.agent_human_ticket[0].status, 'closed')
  assert.strictEqual(deps.tables.agent_session[0].status, 'active')

  const draft = await service.saveKnowledge(customerService, {
    category: 'first_date',
    title: '第一次见面安全',
    content: '选择公共场所并告知亲友行程。',
    tags: ['安全', '第一次约会']
  })
  assert.strictEqual(draft.status, 'draft')
  await assert.rejects(() => service.publishKnowledge(customerService, draft.id), /无权/)
  const published = await service.publishKnowledge(auditor, draft.id)
  assert.strictEqual(published.status, 'published')
  assert.strictEqual(published.reviewer_id, auditor.id)

  const queue = await service.listCoordinations(superAdmin, {})
  assert.strictEqual(queue[0].coordination_ref, 'WF-D-000030')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(queue[0], 'user_a_id'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(queue[0], 'user_b_id'), false)

  await assert.rejects(() => service.listTickets({ role: 'partner', id: 9 }, {}), /无权访问/)

  const backoffice = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/backoffice.js'), 'utf8')
  for (const route of [
    '/api/admin/agent/tickets',
    '/api/admin/agent/conversations',
    'conversationDetail',
    'replyConversation',
    'ticketDetail',
    '/api/admin/knowledge-articles',
    '/api/admin/date-coordinations',
    '/reply',
    '/close',
    '/publish'
  ]) assert(backoffice.includes(route), `backoffice route missing: ${route}`)

  const adminHtml = fs.readFileSync(path.resolve(__dirname, '../public/admin/index.html'), 'utf8')
  for (const route of [
    '/admin/agent/tickets',
    '/admin/agent/conversations',
    'sendCloudConversationReply',
    'detail?.timeline',
    'loadCloudServiceTicket',
    'service-workbench',
    '/admin/date-coordinations',
    '/admin/knowledge-articles',
    'cloudAgentReply',
    'publishCloudKnowledge'
  ]) assert(adminHtml.includes(route), `cloud agent admin UI missing: ${route}`)

  console.log('PASS agent cloud backoffice service')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
