'use strict'

const assert = require('assert')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { QA_COORDINATION_RESET_CONFIRM_TEXT } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')

const users = [
  { id: 101, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'dual-device-v1', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', openid: 'qa-real-a' },
  { id: 102, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'dual-device-v1', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', openid: 'qa-real-b' }
]
const rows = {
  user: users,
  user_match_log: [{ id: 301, user_id: 101, match_user_id: 102 }],
  date_coordination: [],
  date_coordination_event: [],
  agent_notification_job: [],
  agent_message: [],
  coordination_projection_outbox: []
}
let nextId = 500
const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
const deps = {
  rows,
  now: () => new Date('2026-09-04T00:00:00.000Z'),
  currentUser: async (context) => users.find((user) => Number(user.id) === Number(context.user_id)),
  first: async (name, query) => (rows[name] || []).find((row) => same(row, query)) || null,
  list: async (name, query) => (rows[name] || []).filter((row) => same(row, query)),
  byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
  addWithId: async (name, data) => {
    const row = Object.assign({ id: ++nextId }, data)
    ;(rows[name] ||= []).push(row)
    return row
  },
  updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
  claimIfStatus: async (_name, row, expected, patch) => String(row.status) === expected ? Object.assign(row, patch) : null,
  publishCoordinationEvent: async ({ coordination, event }) => deps.addWithId('date_coordination_event', {
    coordination_id: coordination.id,
    event_type: event.event_type,
    actor_user_id: event.actor_user_id,
    coordination_version: event.coordination_version
  }),
  writeInboxNotification: async () => ({ queued: true }),
  enqueueProjectionRetry: async () => null
}

;(async () => {
  const handlers = createDateCoordinationHandlers(deps)
  const created = await handlers.create({ match_log_id: 301, match_user_id: 102 }, { user_id: 101 })
  assert.equal(created.is_test_data, 0, 'real QA coordination is not synthetic test data')
  const coordination = await deps.byId('date_coordination', created.id)
  const allowed = await handlers.detail({ id: coordination.id }, { user_id: 101 })
  assert.equal(allowed.qa_reset_allowed, true)

  const reset = await handlers.qaReset({ coordination_id: coordination.id, confirm_text: QA_COORDINATION_RESET_CONFIRM_TEXT }, { user_id: 101 })
  assert.equal(reset.reset, true)
  assert.equal(reset.event_status, 'projected')

  const mixed = Object.assign({}, users[1], { account_mode: 'production', qa_match_cohort: 'dual-device-v1' })
  rows.user[1] = mixed
  const denied = await handlers.detail({ id: coordination.id }, { user_id: 101 })
  assert.equal(denied.qa_reset_allowed, false)
  await assert.rejects(
    () => handlers.qaReset({ coordination_id: coordination.id, confirm_text: QA_COORDINATION_RESET_CONFIRM_TEXT }, { user_id: 101 }),
    (error) => error && error.errorCode === 'QA_RESET_FORBIDDEN'
  )

  console.log('PASS real dual-QA coordination reset uses create path with is_test_data=0')
})().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
