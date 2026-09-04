'use strict'

const assert = require('assert')
const { STATUS } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { applyMeetingCheckIn } = require('../../miniprogram/cloudfunctions/api/lib/meetingCheckInService')

function memoryDeps() {
  const rows = {
    date_coordination: [{
      _id: 'd1',
      id: 90,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.ARRANGED,
      coordination_version: 1
    }],
    date_coordination_application: [
      { _id: 'a1', id: 1, coordination_id: 90, user_id: 1, coordination_version: 1, application: { arrival_hint: '深蓝外套' } },
      { _id: 'a2', id: 2, coordination_id: 90, user_id: 2, coordination_version: 1, application: { arrival_hint: '白色背包' } }
    ],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    coordination_notification: [],
    coordination_event_outbox: []
  }
  let id = 10
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    rows,
    env: {},
    failPartnerProjection: true,
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    byId: async (name, value) => (rows[name] || []).find((row) => Number(row.id) === Number(value)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => same(row, query)),
    first: async (name, query) => (rows[name] || []).find((row) => same(row, query)) || null,
    addWithId: async (name, data) => {
      if (!rows[name]) rows[name] = []
      const row = Object.assign({ _id: `${name}_${id}`, id: id++ }, data)
      rows[name].push(row)
      return row
    },
    updateByDoc: async (_name, doc, data) => Object.assign(doc, data),
    publishCoordinationEvent: async (input) => {
      const event = await deps.addWithId('date_coordination_event', {
        coordination_id: Number(input.coordination.id),
        event_type: input.event.event_type,
        actor_user_id: input.event.actor_user_id,
        coordination_version: input.event.coordination_version,
        idempotency_key: `evt-${input.event.event_type}-${input.event.actor_user_id}`
      })
      const participants = [Number(input.coordination.user_a_id), Number(input.coordination.user_b_id)]
      const messages = []
      for (const userId of participants) {
        if (deps.failPartnerProjection && userId === Number(input.coordination.user_b_id)) {
          throw new Error('simulated partner projection failure')
        }
        messages.push(await deps.addWithId('agent_message', {
          user_id: userId,
          coordination_id: Number(input.coordination.id),
          coordination_event_id: event.id,
          content: `event:${input.event.event_type}`
        }))
      }
      return { event, messages, created: true, duplicate: false }
    },
    writeInboxNotification: async (input) => {
      await deps.addWithId('coordination_notification', {
        user_id: input.user_id,
        coordination_id: Number(input.coordination.id),
        event_type: input.event_type
      })
      return { queued: true }
    }
  }
  return deps
}

async function main() {
  const deps = memoryDeps()
  const result = await applyMeetingCheckIn({
    coordination_id: 90,
    user_id: 1,
    action: 'arrived',
    arrival_position: '影院大厅取票机旁'
  }, deps)

  assert.strictEqual(result.action_recorded, true)
  assert.strictEqual(result.delivery_status, 'pending')
  assert.ok(Number(result.event_id || 0) > 0 || Number(result.outbox_id || 0) > 0)
  assert.strictEqual(Boolean(deps.rows.date_coordination[0].arrival_a_at), true)
  assert.ok(deps.rows.coordination_event_outbox.length >= 1)
  assert.strictEqual(deps.rows.coordination_event_outbox[0].status, 'pending')
  assert.notStrictEqual(result.delivery_status, 'read')
  assert.ok(!JSON.stringify(result).includes('已通知对方你已到达'))

  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../../miniprogram/pages/date-coordination/date-coordination.js'),
    'utf8'
  )
  assert.ok(source.includes('到场状态已记录'))
  assert.ok(!source.includes("arrived: '已通知对方你已到达'"))

  console.log('PASS meeting delivery observability keeps action when projection pending')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
