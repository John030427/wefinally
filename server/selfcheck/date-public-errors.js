'use strict'

const assert = require('assert')
const { declaredPublicCode } = require('../../miniprogram/cloudfunctions/api/lib/publicErrorCodes')
const {
  dateError,
  RECOVERY
} = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationErrors')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { STATUS } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

function memoryHandlers(seedCoordination) {
  const rows = {
    user: [{ id: 1, openid: 'a', member_status: 'approved', is_vip: 1, status: 1 }],
    date_coordination: [seedCoordination],
    date_coordination_application: [],
    date_submission_outbox: [],
    agent_notification_job: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: []
  }
  let id = 1
  const match = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    unitMode: true,
    rows,
    currentUser: async () => rows.user[0],
    first: async (name, query) => rows[name].find((row) => match(row, query)) || null,
    list: async (name, query) => rows[name].filter((row) => match(row, query)),
    byId: async (name, value) => rows[name].find((row) => Number(row.id) === Number(value)) || null,
    addWithId: async (name, data) => {
      if (!rows[name]) rows[name] = []
      const row = Object.assign({ _id: `${name}_${id}`, id: id++ }, data)
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => new Date('2026-09-04T08:00:00.000Z'),
    writeInboxNotification: async () => null,
    publishCoordinationEvent: async () => ({ created: true, duplicate: false, messages: [] })
  }
  return createDateCoordinationHandlers(deps)
}

async function main() {
  const waiting = dateError('WAITING_PARTNER', '请等待对方完成回应', RECOVERY.WAIT_PARTNER)
  assert.strictEqual(declaredPublicCode(waiting), 'WAITING_PARTNER')
  assert.strictEqual(waiting.recovery, RECOVERY.WAIT_PARTNER)

  const state = dateError('CURRENT_STATE_INVALID', '当前状态不能提交日期申请', RECOVERY.REFRESH)
  assert.strictEqual(declaredPublicCode(state), 'CURRENT_STATE_INVALID')

  const forbidden = dateError('FORBIDDEN', '无权操作该日期协调', RECOVERY.REFRESH)
  assert.strictEqual(declaredPublicCode(forbidden), 'FORBIDDEN')

  const invalid = dateError('DATE_APPLICATION_INVALID', '请补充具体时间', RECOVERY.COMPLETE_FORM)
  assert.strictEqual(declaredPublicCode(invalid), 'DATE_APPLICATION_INVALID')

  const unknown = new Error('db connection exploded at stack')
  assert.strictEqual(declaredPublicCode(unknown), '')

  const handlers = memoryHandlers({
    id: 9,
    user_a_id: 1,
    user_b_id: 2,
    status: STATUS.ARRANGED,
    coordination_version: 1
  })
  await assert.rejects(
    () => handlers.saveApplicationForUser({
      coordination_id: 9,
      availability: [{ date: '2026-09-10', periods: ['night'] }],
      areas: ['南山区'],
      activities: ['电影'],
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h',
      start_time: '20:00',
      activity_venue: '万象天地影城',
      request_id: 'err-1'
    }, { id: 1 }),
    (err) => {
      assert.strictEqual(declaredPublicCode(err), 'CURRENT_STATE_INVALID')
      assert.notStrictEqual(declaredPublicCode(err), 'SERVER_ERROR')
      assert.strictEqual(err.recovery, RECOVERY.REFRESH)
      return true
    }
  )

  const waitHandlers = memoryHandlers({
    id: 10,
    user_a_id: 2,
    user_b_id: 1,
    status: STATUS.COLLECTING_INITIATOR,
    coordination_version: 1
  })
  await assert.rejects(
    () => waitHandlers.saveApplicationForUser({
      coordination_id: 10,
      availability: [{ date: '2026-09-10', periods: ['night'] }],
      areas: ['南山区'],
      activities: ['电影'],
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h',
      start_time: '20:00',
      activity_venue: '万象天地影城',
      request_id: 'err-2'
    }, { id: 1 }),
    (err) => {
      assert.strictEqual(declaredPublicCode(err), 'WAITING_PARTNER')
      assert.strictEqual(err.recovery, RECOVERY.WAIT_PARTNER)
      return true
    }
  )

  console.log('PASS date public recoverable errors')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
