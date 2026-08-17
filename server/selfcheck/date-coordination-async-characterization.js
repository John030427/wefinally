const assert = require('assert')

const dateCoordinationModule = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
let processingPolicy = {}
try {
  processingPolicy = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationProcessingPolicy')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
}

const NOW = new Date('2026-08-15T08:00:00.000Z')

function memoryDeps(seed = {}) {
  const rows = Object.assign({}, seed)
  const counters = {}
  function collection(name) {
    if (!rows[name]) rows[name] = []
    return rows[name]
  }
  return {
    rows,
    currentUser: async (context) => {
      const user = collection('user').find((item) => Number(item.id) === Number(context.user_id))
      if (!user) throw new Error('登录已过期，请重新登录')
      return user
    },
    first: async (name, query) => collection(name).find((item) => Object.keys(query || {}).every((key) => item[key] === query[key])) || null,
    list: async (name, query, limit = 100) => collection(name)
      .filter((item) => Object.keys(query || {}).every((key) => item[key] === query[key]))
      .slice(0, limit),
    byId: async (name, id) => collection(name).find((item) => Number(item.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      counters[name] = (counters[name] || collection(name).length) + 1
      const row = Object.assign({ _id: `${name}_${counters[name]}`, id: counters[name] }, data)
      collection(name).push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => {
      Object.assign(doc, data)
      return doc
    },
    upsertConfirmation: async () => null,
    updateConfirmationState: async (coordination, result) => {
      Object.assign(coordination, result.coordination)
      return coordination
    },
    expireIfCurrent: async () => false,
    now: () => new Date(NOW)
  }
}

function application() {
  return {
    availability: [{ date: '2026-08-18', periods: ['evening'] }],
    areas: ['南山区'],
    activities: ['咖啡'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h'
  }
}

async function asyncQueueLifecycle() {
  const deps = memoryDeps({
    user: [
      { id: 1, member_status: 'approved', free_member: 1 },
      { id: 2, member_status: 'approved', free_member: 1 }
    ],
    date_coordination: [{
      id: 51,
      user_a_id: 1,
      user_b_id: 2,
      status: 'collecting_preferences',
      business_state: 'coordinating',
      coordination_version: 1,
      recoordination_count: 0,
      application_deadline_at: '2026-08-16T08:00:00.000Z'
    }],
    date_coordination_application: [{
      id: 1,
      coordination_id: 51,
      user_id: 1,
      coordination_version: 1,
      application: application()
    }]
  })
  const handlers = dateCoordinationModule.createDateCoordinationHandlers(deps)
  const result = await handlers.saveApplication({ coordination_id: 51, ...application() }, { user_id: 2 })

  assert.strictEqual(result.status, 'computing_overlap')
  assert.strictEqual(result.processing_status, 'queued')
  assert.strictEqual(result.processing_version, 1)
  assert.strictEqual(deps.rows.date_coordination_proposal.length, 0)
}

async function fiveRoundBoundary() {
  const deps = memoryDeps({
    user: [{ id: 1, member_status: 'approved', free_member: 1 }],
    date_coordination: [{
      id: 77,
      user_a_id: 1,
      user_b_id: 2,
      status: 'no_overlap',
      coordination_version: 4,
      recoordination_count: 3
    }]
  })
  const result = await dateCoordinationModule.createDateCoordinationHandlers(deps)
    .recoordinate({ coordination_id: 77 }, { user_id: 1 })

  assert.strictEqual(result.status, 'replanning')
  assert.strictEqual(result.coordination_version, 5)
  assert.strictEqual(result.recoordination_count, 4)
  assert.strictEqual(result.round_number, 5)
  assert.strictEqual(result.max_rounds, 5)
}

async function staleWorkerCannotOverwriteNewVersion() {
  assert.strictEqual(typeof processingPolicy.claimProcessingVersion, 'function')
  assert.strictEqual(typeof processingPolicy.completeProcessingVersion, 'function')

  const claimed = processingPolicy.claimProcessingVersion({
    status: 'computing_overlap',
    coordination_version: 1,
    processing_status: 'queued',
    processing_version: 1
  }, { token: 'lease-v1', now: NOW })
  const newer = Object.assign({}, claimed, {
    coordination_version: 2,
    processing_status: 'queued',
    processing_version: 2,
    processing_token: ''
  })
  const completion = processingPolicy.completeProcessingVersion(newer, {
    version: 1,
    token: 'lease-v1',
    now: NOW
  })

  assert.strictEqual(completion.applied, false)
  assert.strictEqual(completion.reason, 'stale_processing_version')
  assert.strictEqual(completion.coordination.coordination_version, 2)
  assert.strictEqual(completion.coordination.processing_status, 'queued')
}

async function participantEventProjectionIsPrivate() {
  assert.strictEqual(typeof processingPolicy.projectParticipantEvent, 'function')
  const event = processingPolicy.projectParticipantEvent({
    event_type: 'application_submitted',
    actor_user_id: 2,
    application: Object.assign(application(), {
      share_message: '只对协调员说的原始内容',
      other_requirements: '私人补充要求'
    })
  }, { viewer_user_id: 1, partner_user_id: 2 })

  const serialized = JSON.stringify(event)
  assert.strictEqual(serialized.includes('只对协调员说的原始内容'), false)
  assert.strictEqual(serialized.includes('私人补充要求'), false)
  assert.strictEqual(serialized.includes('actor_user_id'), false)
  assert.strictEqual(event.stage, 'partner_application_submitted')
}

async function main() {
  const cases = [
    ['second application queues processing instead of generating inline', asyncQueueLifecycle],
    ['coordination supports a fifth round before manual handoff', fiveRoundBoundary],
    ['stale worker completion cannot overwrite a newer version', staleWorkerCannotOverwriteNewVersion],
    ['participant event projection does not leak the other application', participantEventProjectionIsPrivate]
  ]
  const failures = []
  for (const [name, run] of cases) {
    try {
      await run()
      console.log(`PASS ${name}`)
    } catch (error) {
      failures.push({ name, error })
      console.error(`RED ${name}: ${error.message}`)
    }
  }
  if (failures.length) {
    throw new Error(`${failures.length} date coordination characterization case(s) remain RED`)
  }
  console.log('PASS async bilateral date coordination characterization')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
