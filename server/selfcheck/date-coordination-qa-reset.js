const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')

function depsFor(user) {
  const tables = {
    date_coordination: [{
      _id: 'date_coordination_99', id: 99, pair_key: '1:2', user_a_id: 1, user_b_id: 2,
      status: 'collecting_preferences', business_state: 'waiting_invitee_preference', coordination_version: 1
    }],
    agent_session: [
      { _id: 'session-a', id: 10, coordination_id: 99, user_id: 1, status: 'active' },
      { _id: 'session-b', id: 11, coordination_id: 99, user_id: 2, status: 'active' }
    ],
    agent_notification_job: [{ _id: 'job', id: 12, coordination_id: 99, status: 'pending' }],
    date_application_patch: [{ _id: 'patch', id: 13, coordination_id: 99, status: 'pending_confirmation' }],
    date_coordination_proposal: [],
    date_coordination_confirmation: []
  }
  const events = []
  return {
    tables,
    events,
    deps: {
      env: {},
      currentUser: async () => user,
      now: () => new Date('2026-09-02T15:10:00.000Z'),
      byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)),
      first: async (name, query) => (tables[name] || []).find((row) => Object.keys(query).every((key) => row[key] === query[key])) || null,
      list: async (name, query) => (tables[name] || []).filter((row) => Object.keys(query || {}).every((key) => row[key] === query[key])),
      updateByDoc: async (_name, row, update) => Object.assign(row, update),
      addWithId: async () => ({}),
      publishCoordinationEvent: async (input) => { events.push(input.event); return { messages: [] } },
      writeInboxNotification: async () => ({})
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const routeSource = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
  const pageSource = fs.readFileSync(path.join(root, 'miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
  assert(routeSource.includes('/qa-reset'))
  assert(pageSource.includes('coordination.qa_reset_allowed'))
  assert(pageSource.includes('bindtap="resetQaCoordination"'))

  const qa = depsFor({ id: 1, qa_match_cohort: 'qa-real-device-registration-v1' })
  const handler = createDateCoordinationHandlers(qa.deps)
  const result = await handler.qaReset({ coordination_id: 99, confirm_text: '重新开始本轮测试' }, {})
  assert.strictEqual(result.status, 'closed')
  assert.strictEqual(qa.tables.date_coordination[0].business_state, 'qa_reset')
  assert(qa.tables.agent_session.every((row) => row.status === 'closed'))
  assert.strictEqual(qa.tables.agent_notification_job[0].status, 'cancelled')
  assert.strictEqual(qa.tables.date_application_patch[0].status, 'cancelled')
  assert(qa.events.some((event) => event.event_type === 'qa_coordination_reset'))

  const normal = depsFor({ id: 1, qa_match_cohort: '' })
  await assert.rejects(
    () => createDateCoordinationHandlers(normal.deps).qaReset({ coordination_id: 99, confirm_text: '重新开始本轮测试' }, {}),
    /仅限双真机 QA 测试账号/
  )
  console.log('PASS guarded QA coordination soft reset')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
