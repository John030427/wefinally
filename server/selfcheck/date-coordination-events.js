const assert = require('assert')
const {
  publishCoordinationEvent,
  safeChangedDimensions,
  attachMemoryIdempotentCreates
} = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')

function memoryDeps() {
  const tables = {
    agent_session: [],
    agent_message: [],
    date_coordination_event: []
  }
  let id = 0
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return attachMemoryIdempotentCreates({
    tables,
    first: async (name, query) => tables[name].find((row) => matches(row, query)) || null,
    list: async (name, query) => tables[name].filter((row) => matches(row, query)),
    addWithId: async (name, data) => {
      const row = Object.assign({ _id: `${name}_${++id}`, id }, data)
      tables[name].push(row)
      return row
    },
    now: () => new Date('2026-08-15T08:00:00.000Z')
  })
}

async function main() {
  assert.deepStrictEqual(
    safeChangedDimensions(['activity', 'phone', 'budget', 'activity', 'openid']),
    ['activity', 'budget']
  )
  const deps = memoryDeps()
  const coordination = { id: 51, user_a_id: 1, user_b_id: 2, coordination_version: 1 }
  const event = {
    event_type: 'application_submitted',
    actor_user_id: 2,
    coordination_version: 1,
    application: {
      share_message: '只对协调员说的原始内容',
      other_requirements: '私人补充要求',
      phone: '13800000000',
      openid: 'om-private'
    }
  }
  const first = await publishCoordinationEvent({ coordination, event }, deps)
  assert.strictEqual(first.messages.length, 2)
  assert.strictEqual(deps.tables.agent_session.length, 2)
  assert.strictEqual(deps.tables.agent_message.length, 2)
  assert.strictEqual(deps.tables.date_coordination_event.length, 1)
  assert.deepStrictEqual(deps.tables.agent_session.map((row) => row.user_id).sort(), [1, 2])
  const userA = deps.tables.agent_message.find((row) => row.user_id === 1)
  const userB = deps.tables.agent_message.find((row) => row.user_id === 2)
  assert.strictEqual(userA.stage, 'partner_application_submitted')
  assert.strictEqual(userB.stage, 'my_application_submitted')
  const serialized = JSON.stringify({
    event: deps.tables.date_coordination_event,
    messages: deps.tables.agent_message
  })
  assert(!serialized.includes('只对协调员说的原始内容'))
  assert(!serialized.includes('私人补充要求'))
  assert(!serialized.includes('13800000000'))
  assert(!serialized.includes('om-private'))

  await publishCoordinationEvent({ coordination, event }, deps)
  assert.strictEqual(deps.tables.agent_session.length, 2)
  assert.strictEqual(deps.tables.agent_message.length, 2)
  assert.strictEqual(deps.tables.date_coordination_event.length, 1)

  const proposal = await publishCoordinationEvent({
    coordination,
    event: {
      event_type: 'proposal_generated',
      coordination_version: 1,
      proposal: {
        proposal_key: 'safe-proposal',
        date: '2026-08-18',
        period: 'evening',
        area: '南山区',
        activity: '咖啡',
        duration: '1-2h'
      }
    }
  }, deps)
  assert.strictEqual(proposal.messages.length, 2)
  assert(proposal.messages.every((row) => row.content.includes('2026-08-18')))
  assert(proposal.messages.every((row) => row.content.includes('南山区')))

  const newestUserBSession = await deps.addWithId('agent_session', {
    user_id: 2,
    agent_type: 'date_coordinator',
    coordination_id: 51,
    status: 'active'
  })

  const arrival = await publishCoordinationEvent({
    coordination,
    event: {
      event_type: 'participant_arrived',
      actor_user_id: 1,
      coordination_version: 1,
      idempotency_suffix: 'arrival-a',
      arrival_position: '星巴克吧台旁'
    }
  }, deps)
  const arrivalForA = arrival.messages.find((row) => row.user_id === 1)
  const arrivalForB = arrival.messages.find((row) => row.user_id === 2)
  assert(arrivalForA.content.includes('同步给对方'))
  assert(arrivalForB.content.includes('星巴克吧台旁'))
  assert.strictEqual(arrivalForB.stage, 'partner_arrived')
  assert.strictEqual(arrivalForB.session_id, newestUserBSession.id)

  console.log('PASS bilateral coordination events are private and idempotent')

  // Concurrent same-event publish must create one event and two projection messages.
  const raceDeps = memoryDeps()
  const raceCoordination = { id: 77, user_a_id: 11, user_b_id: 22, coordination_version: 3 }
  const raceEvent = {
    event_type: 'proposal_generated',
    coordination_version: 3,
    proposal: {
      proposal_key: 'race-proposal',
      date: '2026-09-10',
      period: 'evening',
      area: '福田区',
      activity: '散步'
    }
  }
  const raceInput = { coordination: raceCoordination, event: raceEvent }
  const [left, right] = await Promise.all([
    publishCoordinationEvent(raceInput, raceDeps),
    publishCoordinationEvent(raceInput, raceDeps)
  ])
  assert.strictEqual(raceDeps.tables.date_coordination_event.length, 1)
  assert.strictEqual(raceDeps.tables.agent_message.filter((row) => row.coordination_event_key).length, 2)
  assert.strictEqual([left, right].filter((result) => result.duplicate).length, 1)
  assert.strictEqual([left, right].filter((result) => result.created).length, 1)

  // Event created once, then message delivery fails mid-way; retry recovers projections.
  const recoverTables = {
    agent_session: [],
    agent_message: [],
    date_coordination_event: []
  }
  let recoverId = 0
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const baseRecover = {
    tables: recoverTables,
    first: async (name, query) => recoverTables[name].find((row) => matches(row, query)) || null,
    list: async (name, query) => recoverTables[name].filter((row) => matches(row, query)),
    addWithId: async (name, data) => {
      const row = Object.assign({ _id: `${name}_${++recoverId}`, id: recoverId }, data)
      recoverTables[name].push(row)
      return row
    },
    now: () => new Date('2026-08-15T08:00:00.000Z')
  }
  attachMemoryIdempotentCreates(baseRecover)
  let failNextMessage = true
  const failingCreateMessage = baseRecover.createAgentMessageOnce
  baseRecover.createAgentMessageOnce = async (messageRecord) => {
    if (failNextMessage) {
      failNextMessage = false
      throw new Error('simulated delivery failure')
    }
    return failingCreateMessage(messageRecord)
  }
  const recoverCoordination = { id: 88, user_a_id: 31, user_b_id: 32, coordination_version: 1 }
  const recoverEvent = {
    event_type: 'application_submitted',
    actor_user_id: 31,
    coordination_version: 1,
    application: { share_message: 'secret-recover', phone: '13900000000' }
  }
  const recoverInput = { coordination: recoverCoordination, event: recoverEvent }
  await assert.rejects(() => publishCoordinationEvent(recoverInput, baseRecover), /simulated delivery failure/)
  assert.strictEqual(recoverTables.date_coordination_event.length, 1)
  assert.ok(recoverTables.agent_message.length < 2)

  const recovered = await publishCoordinationEvent(recoverInput, baseRecover)
  assert.strictEqual(recovered.duplicate, true)
  assert.strictEqual(recoverTables.date_coordination_event.length, 1)
  assert.strictEqual(recoverTables.agent_message.length, 2)
  const recoverSerialized = JSON.stringify(recoverTables)
  assert(!recoverSerialized.includes('secret-recover'))
  assert(!recoverSerialized.includes('13900000000'))

  console.log('PASS coordination event concurrency and delivery recovery')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
