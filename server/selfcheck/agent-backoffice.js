const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { createAgentBackofficeService } = require('../../miniprogram/cloudfunctions/api/agent/backofficeService')

function fakeDeps() {
  const tables = {
    agent_human_ticket: [{ id: 1, session_id: 10, user_id: 7, priority: 'P1', category: 'privacy', summary: '隐私问题', status: 'open' }],
    agent_session: [{ id: 10, user_id: 7, agent_type: 'platform_service', status: 'manual_pending' }],
    agent_message: [],
    knowledge_article: [],
    date_coordination: [{ id: 30, user_a_id: 7, user_b_id: 8, status: 'no_overlap', coordination_version: 2, recoordination_count: 1 }]
  }
  let id = 100
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    tables,
    now: () => new Date('2026-07-12T12:00:00.000Z'),
    async list(name, query) { return (tables[name] || []).filter((row) => matches(row, query)) },
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

  await service.replyTicket(customerService, 1, '已收到，我来协助处理。')
  assert.strictEqual(deps.tables.agent_message[0].sender_type, 'human_agent')
  assert.strictEqual(deps.tables.agent_message[0].session_id, 10)
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
    '/api/admin/knowledge-articles',
    '/api/admin/date-coordinations',
    '/reply',
    '/close',
    '/publish'
  ]) assert(backoffice.includes(route), `backoffice route missing: ${route}`)

  const adminHtml = fs.readFileSync(path.resolve(__dirname, '../public/admin/index.html'), 'utf8')
  for (const route of [
    '/admin/agent/tickets',
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
