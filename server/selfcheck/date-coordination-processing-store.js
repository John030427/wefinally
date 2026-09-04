const assert = require('assert')
const path = require('path')

function fakeDatabase(seed = {}) {
  const state = Object.assign({
    date_coordinations: {},
    date_applications: {},
    date_proposals: {},
    date_confirmations: {},
    system_counters: {}
  }, seed)
  let transactionTail = Promise.resolve()

  function table(name) {
    if (!state[name]) state[name] = {}
    return state[name]
  }

  function doc(name, id) {
    return {
      async get() {
        const row = table(name)[id]
        return { data: row ? Object.assign({ _id: id }, row) : null }
      },
      async set({ data }) {
        table(name)[id] = Object.assign({}, data)
        return { stats: { created: 1 } }
      },
      async update({ data }) {
        if (!table(name)[id]) throw new Error(`missing ${name}/${id}`)
        table(name)[id] = Object.assign({}, table(name)[id], data)
        return { stats: { updated: 1 } }
      }
    }
  }

  function collection(name) {
    return {
      doc(id) { return doc(name, String(id)) },
      where(query) {
        let max = 100
        return {
          limit(value) { max = Number(value || 100); return this },
          async get() {
            const data = Object.entries(table(name))
              .map(([id, row]) => Object.assign({ _id: id }, row))
              .filter((row) => Object.keys(query || {}).every((key) => row[key] === query[key]))
              .slice(0, max)
            return { data }
          }
        }
      }
    }
  }

  const database = {
    state,
    command: {},
    collection,
    async createCollection(name) { table(name) },
    runTransaction(handler) {
      const result = transactionTail.then(async () => {
        const snapshot = JSON.parse(JSON.stringify(state))
        try { return await handler({ collection }) } catch (error) {
          for (const key of Object.keys(state)) delete state[key]
          Object.assign(state, snapshot)
          throw error
        }
      })
      transactionTail = result.catch(() => undefined)
      return result
    }
  }
  return database
}

async function main() {
  const cloud = require('../../miniprogram/cloudfunctions/api/node_modules/wx-server-sdk')
  const dbPath = path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/db.js')
  const originalDatabase = cloud.database
  const fake = fakeDatabase({
    date_coordinations: {
      date_coordination_51: {
        id: 51,
        user_a_id: 1,
        user_b_id: 2,
        status: 'computing_overlap',
        coordination_version: 1,
        processing_status: 'queued',
        processing_version: 1,
        processing_attempts: 0
      },
      date_coordination_52: {
        id: 52,
        user_a_id: 1,
        user_b_id: 2,
        status: 'computing_overlap',
        coordination_version: 1,
        processing_status: 'queued',
        processing_version: 1,
        processing_attempts: 0
      },
      date_coordination_53: {
        id: 53,
        user_a_id: 1,
        user_b_id: 2,
        status: 'computing_overlap',
        coordination_version: 1,
        processing_status: 'processing',
        processing_version: 1,
        processing_attempts: 3,
        processing_token: 'expired-lease',
        processing_started_at: '2026-08-15T07:00:00.000Z'
      },
      date_coordination_54: {
        id: 54,
        user_a_id: 1,
        user_b_id: 2,
        status: 'waiting_confirmations',
        business_state: 'proposal_generated',
        coordination_version: 1,
        final_proposal_id: 0
      },
      date_coordination_55: {
        id: 55,
        user_a_id: 1,
        user_b_id: 2,
        status: 'waiting_confirmations',
        business_state: 'proposal_generated',
        coordination_version: 1,
        final_proposal_id: 0
      }
    },
    date_proposals: {
      date_coordination_proposal_90: {
        id: 90,
        coordination_id: 54,
        coordination_version: 1,
        status: 'active',
        proposal_key: 'v1-shared'
      },
      date_coordination_proposal_91: {
        id: 91,
        coordination_id: 55,
        coordination_version: 1,
        status: 'active',
        proposal_key: 'v1-left'
      },
      date_coordination_proposal_92: {
        id: 92,
        coordination_id: 55,
        coordination_version: 1,
        status: 'active',
        proposal_key: 'v1-right'
      }
    }
  })
  cloud.database = () => fake
  delete require.cache[dbPath]
  let db
  try {
    db = require(dbPath)
  } finally {
    cloud.database = originalDatabase
  }

  const now = new Date('2026-08-15T08:00:00.000Z')
  const listed = await db.listCoordinationProcessingTasks(now, 10)
  assert.strictEqual(listed.length, 3)

  const exhausted = await db.claimCoordinationProcessing(listed.find((row) => row.id === 53), now)
  assert.strictEqual(exhausted, null)
  assert.strictEqual(fake.state.date_coordinations.date_coordination_53.processing_status, 'failed')
  assert.strictEqual(fake.state.date_coordinations.date_coordination_53.processing_error_code, 'worker_interrupted')

  const concurrentClaims = await Promise.all([
    db.claimCoordinationProcessing(listed[0], now),
    db.claimCoordinationProcessing(listed[0], now)
  ])
  assert.strictEqual(concurrentClaims.filter(Boolean).length, 1)
  const claim = concurrentClaims.find(Boolean)
  assert.strictEqual(claim.processing_status, 'processing')
  assert.strictEqual(claim.processing_attempts, 1)

  const completed = await db.completeCoordinationProcessing(claim, {
    proposals: [{
      proposal_key: 'v1-2026-08-18-evening-南山区-咖啡',
      coordination_version: 1,
      date: '2026-08-18',
      period: 'evening',
      area: '南山区',
      activity: '咖啡',
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h'
    }],
    missing_dimensions: []
  }, now)
  assert.strictEqual(completed.applied, true)
  assert.strictEqual(fake.state.date_coordinations.date_coordination_51.status, 'waiting_confirmations')
  assert.strictEqual(fake.state.date_coordinations.date_coordination_51.processing_status, 'completed')
  assert.strictEqual(Object.keys(fake.state.date_proposals).length, 4)

  const coordination54 = Object.assign({ _id: 'date_coordination_54' }, fake.state.date_coordinations.date_coordination_54)
  const proposal90 = Object.assign({ _id: 'date_coordination_proposal_90' }, fake.state.date_proposals.date_coordination_proposal_90)
  const confirmations = await Promise.all([
    db.commitCoordinationConfirmation(coordination54, proposal90, { user_id: 1, decision: 'confirm' }, now),
    db.commitCoordinationConfirmation(coordination54, proposal90, { user_id: 2, decision: 'confirm' }, now)
  ])
  assert.strictEqual(confirmations.filter((item) => item.arranged).length, 1)
  assert.strictEqual(fake.state.date_coordinations.date_coordination_54.status, 'arranged')
  assert.strictEqual(fake.state.date_coordinations.date_coordination_54.final_proposal_id, 90)
  assert.strictEqual(Object.keys(fake.state.date_confirmations).length, 2)
  const replayConfirmation = await db.commitCoordinationConfirmation(
    coordination54, proposal90, { user_id: 1, decision: 'confirm' }, now
  )
  assert.strictEqual(replayConfirmation.idempotent, true)

  const coordination55 = Object.assign({ _id: 'date_coordination_55' }, fake.state.date_coordinations.date_coordination_55)
  const proposal91 = Object.assign({ _id: 'date_coordination_proposal_91' }, fake.state.date_proposals.date_coordination_proposal_91)
  const proposal92 = Object.assign({ _id: 'date_coordination_proposal_92' }, fake.state.date_proposals.date_coordination_proposal_92)
  const splitConfirmations = await Promise.all([
    db.commitCoordinationConfirmation(coordination55, proposal91, { user_id: 1, decision: 'confirm' }, now),
    db.commitCoordinationConfirmation(coordination55, proposal92, { user_id: 2, decision: 'confirm' }, now)
  ])
  assert(splitConfirmations.every((item) => item.arranged === false))
  assert.strictEqual(fake.state.date_coordinations.date_coordination_55.status, 'waiting_confirmations')
  assert.strictEqual(fake.state.date_coordinations.date_coordination_55.final_proposal_id, 0)

  const replay = await db.completeCoordinationProcessing(claim, { proposals: [], missing_dimensions: [] }, now)
  assert.strictEqual(replay.applied, false)
  assert.strictEqual(Object.keys(fake.state.date_proposals).length, 4)

  const staleClaim = await db.claimCoordinationProcessing(listed[1], now)
  Object.assign(fake.state.date_coordinations.date_coordination_52, {
    coordination_version: 2,
    processing_version: 2,
    processing_status: 'queued',
    processing_token: ''
  })
  const stale = await db.completeCoordinationProcessing(staleClaim, {
    proposals: [{ proposal_key: 'must-not-write', coordination_version: 1 }],
    missing_dimensions: []
  }, now)
  assert.strictEqual(stale.applied, false)
  assert.strictEqual(stale.reason, 'stale_processing_version')
  assert.strictEqual(Object.keys(fake.state.date_proposals).length, 4)

  const flexible = { contract_version: 3, date: '2026-09-06', period: 'night', start_time: '20:00',
    area: '南山', activity: '吃饭', activity_venue: '万象城', budget: '50-100',
    payment_mode: 'aa', duration: 'about-1h', venue_choice_mode: 'choose_on_arrival',
    open_items: [{ key: 'store_on_arrival', label: '门店到场后商量', accepted_by: [1, 2] }] }
  for (const id of [56, 57]) {
    const c = { _id: `date_coordination_${id}`, id, user_a_id: 1, user_b_id: 2,
      status: 'waiting_confirmations', coordination_version: 2 }
    const p = { ...flexible, _id: `date_coordination_proposal_${id}`, id, coordination_id: id,
      coordination_version: 2, status: 'active' }
    if (id === 57) Object.assign(p, { activity: '电影', activity_venue: '星巴克', venue_choice_mode: 'named_location' })
    fake.state.date_coordinations[c._id] = c
    fake.state.date_proposals[p._id] = p
    // A stale version's confirmation and forged accepted_by cannot finalize.
    fake.state.date_confirmations[`date-confirmation-${id}-2-v1`] = {
      user_id: 2, decision: 'confirm', proposal_id: id, coordination_version: 1 }
    assert.strictEqual((await db.commitCoordinationConfirmation(c, p, { user_id: 1, decision: 'confirm' }, now)).arranged, false)
    if (id === 56) {
      assert.strictEqual((await db.commitCoordinationConfirmation(c, p, { user_id: 2, decision: 'confirm' }, now)).arranged, true)
    } else {
      await assert.rejects(db.commitCoordinationConfirmation(c, p, { user_id: 2, decision: 'confirm' }, now), /待澄清/)
      assert.strictEqual(fake.state.date_coordinations[c._id].status, 'waiting_confirmations')
      assert.strictEqual(fake.state.date_confirmations[`date-confirmation-${id}-2-v2`], undefined)
    }
  }
  const direct = { _id: 'date_coordination_58', id: 58, user_a_id: 1, user_b_id: 2,
    status: 'inviting_partner', coordination_version: 1, invitation_version: 1,
    invitation_primary_proposal: flexible }
  fake.state.date_coordinations[direct._id] = direct
  const accepted = await db.commitDirectInvitationAccept({ coordination: direct, inviteeUserId: 2,
    invitationVersion: 1, proposalData: { ...flexible, proposal_key: 'flexible-direct' } }, now)
  assert.strictEqual(accepted.arranged, true)
  assert.strictEqual(accepted.proposal.venue_choice_mode, 'choose_on_arrival')
  assert.deepStrictEqual(accepted.proposal.open_items[0].accepted_by, [])
  console.log('PASS CloudBase coordination processing store is CAS-safe and idempotent; flexible finalization uses transaction confirmations')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
