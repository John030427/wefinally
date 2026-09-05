const assert = require('assert')

const {
  previewApplicationChange,
  shareableSummary
} = require('../../miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy')

const testNow = new Date()

function futureDate(days) {
  const value = new Date(testNow)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const current = {
  availability: [{ date: futureDate(3), periods: ['afternoon'] }],
  areas: ['福田区'],
  activities: ['电影'],
  budget: '100-200',
  payment_preference: 'aa',
  duration: '1-2h',
  transport_constraints: '',
  other_requirements: '',
  share_message: ''
}

const changes = { activities: ['咖啡', '散步'], budget: 'under-50' }
const preview = previewApplicationChange(current, changes, { hasActiveProposal: true })
assert.deepStrictEqual(preview.before.activities, ['电影'])
assert.deepStrictEqual(preview.after.activities, ['咖啡', '散步'])
assert.strictEqual(preview.affects_existing_proposal, true)
assert.strictEqual(preview.will_notify_partner, true)

const summary = shareableSummary(preview)
assert.deepStrictEqual(summary.changed_dimensions, ['activity', 'budget'])
assert.strictEqual(JSON.stringify(summary).includes('电影'), false)
assert.strictEqual(JSON.stringify(summary).includes('不想'), false)

async function serviceChecks() {
  const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
  const tables = {
    user: [{ id: 1 }, { id: 2 }, { id: 3 }],
    date_coordination: [{
      id: 50,
      user_a_id: 1,
      user_b_id: 2,
      status: 'waiting_confirmations',
      business_state: 'proposal_generated',
      coordination_version: 1,
      recoordination_count: 0
    }],
    date_coordination_application: [
      { id: 1, coordination_id: 50, user_id: 1, coordination_version: 1, application: current },
      { id: 2, coordination_id: 50, user_id: 2, coordination_version: 1, application: {
        ...current,
        activities: ['咖啡'],
        budget: 'under-50'
      } }
    ],
    date_coordination_proposal: [{ id: 9, coordination_id: 50, coordination_version: 1, status: 'active' }],
    date_coordination_confirmation: [{ id: 10, coordination_id: 50, user_id: 2, coordination_version: 1, decision: 'confirm' }],
    date_application_patch: [],
    date_coordination_event: [],
    agent_session: [
      { id: 100, user_id: 1, agent_type: 'date_coordinator', coordination_id: 50, status: 'active' },
      { id: 200, user_id: 2, agent_type: 'date_coordinator', coordination_id: 50, status: 'active' }
    ],
    agent_message: [],
    agent_notification_job: []
  }
  let nextId = 300
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    now: () => new Date(testNow),
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => matches(row, query)),
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      const row = { id: ++nextId, ...data }
      if (!tables[name]) tables[name] = []
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => {
      const updated = Object.assign({}, row, data)
      const index = (tables[name] || []).indexOf(row)
      if (index >= 0) tables[name][index] = updated
      return updated
    },
    claimPendingPatch: async (patch) => {
      const current = tables.date_application_patch.find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    }
  }
  const handlers = createDateApplicationPatchHandlers(deps)
  const initialPending = await handlers.createPreviewForUser({
    coordination_id: 50,
    session_id: 100,
    changes: { activities: ['咖啡'], budget: 'under-50' },
    source_message_id: 88
  }, tables.user[0])
  const pending = await handlers.createPreviewForUser({
    coordination_id: 50,
    session_id: 100,
    changes: { activities: ['散步'], budget: 'under-50' },
    source_message_id: 89
  }, tables.user[0])
  assert.strictEqual(tables.date_application_patch.find((row) => Number(row.id) === Number(initialPending.id)).status, 'superseded', 'a newer complete proposal supersedes the previous preview')
  assert.strictEqual(tables.date_application_patch.filter((row) => row.status === 'pending_confirmation').length, 1, 'one actionable preview remains')
  assert.strictEqual(pending.status, 'pending_confirmation')
  assert.strictEqual(pending.base_version, 1)
  assert.deepStrictEqual(pending.preview.before.activities, ['电影'])
  assert.strictEqual(tables.date_coordination[0].coordination_version, 1)
  assert.strictEqual(tables.date_coordination_proposal[0].status, 'active')
  await assert.rejects(
    () => handlers.confirmForUser({ coordination_id: 50, patch_id: pending.id }, tables.user[2]),
    /无权确认/
  )
  const concurrent = await Promise.allSettled([
    handlers.confirmForUser({ coordination_id: 50, patch_id: pending.id }, tables.user[0]),
    handlers.confirmForUser({ coordination_id: 50, patch_id: pending.id }, tables.user[0])
  ])
  const fulfilled = concurrent.filter((item) => item.status === 'fulfilled')
  const rejected = concurrent.filter((item) => item.status === 'rejected')
  assert.strictEqual(fulfilled.length, 1)
  assert.strictEqual(rejected.length, 1)
  assert.match(rejected[0].reason.message, /正在处理中/)
  const applied = fulfilled[0].value
  assert.strictEqual(applied.patch.status, 'applied')
  assert.strictEqual(applied.coordination_version, 2)
  assert.strictEqual(tables.date_coordination[0].coordination_version, 2)
  assert.strictEqual(tables.date_coordination[0].status, 'computing_overlap')
  assert.strictEqual(tables.date_coordination[0].business_state, 'processing')
  assert.strictEqual(tables.date_coordination[0].processing_status, 'queued')
  assert.strictEqual(tables.date_coordination[0].processing_version, 2)
  assert.strictEqual(tables.date_coordination[0].recoordination_count, 1)
  assert.strictEqual(tables.date_coordination_proposal[0].status, 'superseded')
  assert.strictEqual(tables.date_coordination_confirmation[0].status, 'superseded')
  assert.strictEqual(tables.date_coordination_application.filter((row) => row.coordination_version === 2).length, 2)
  assert.strictEqual(tables.date_coordination_proposal.filter((row) => row.coordination_version === 2).length, 0)
  const partnerMessage = tables.agent_message.find((row) => row.session_id === 200)
  assert(partnerMessage.content.includes('对方想把'))
  assert.strictEqual(partnerMessage.content.includes('电影'), false)
  assert.strictEqual(partnerMessage.content.includes('不想'), false)
  assert.strictEqual(tables.date_coordination_event.length, 1)
  assert.strictEqual(tables.agent_notification_job.length, 1)
  assert.deepStrictEqual(tables.date_coordination_event[0].shareable_summary.changed_dimensions, ['activity', 'budget'])
  const repeated = await handlers.confirmForUser({ coordination_id: 50, patch_id: pending.id }, tables.user[0])
  assert.strictEqual(repeated.coordination_version, 2)
  const noOverlapPreview = await handlers.createPreviewForUser({
    coordination_id: 50,
    session_id: 100,
    changes: { areas: ['罗湖区'] }
  }, tables.user[0])
  const noOverlap = await handlers.confirmForUser({
    coordination_id: 50,
    patch_id: noOverlapPreview.id
  }, tables.user[0])
  assert.strictEqual(noOverlap.coordination_version, 3)
  assert.strictEqual(noOverlap.status, 'computing_overlap')
  assert.strictEqual(noOverlap.business_state, 'processing')
  assert.strictEqual(tables.date_coordination[0].processing_status, 'queued')
  assert.strictEqual(tables.date_coordination[0].processing_version, 3)
  assert.strictEqual(tables.date_coordination[0].recoordination_count, 2)
  assert.strictEqual(noOverlap.proposal_generated, false)
  const stalePreview = await handlers.createPreviewForUser({
    coordination_id: 50,
    session_id: 100,
    changes: { budget: 'flexible' }
  }, tables.user[0])
  tables.date_coordination[0].coordination_version = 4
  await assert.rejects(
    () => handlers.confirmForUser({ coordination_id: 50, patch_id: stalePreview.id }, tables.user[0]),
    /已更新.*重新生成/
  )

  tables.date_coordination[0] = Object.assign({}, tables.date_coordination[0], {
    status: 'no_overlap',
    business_state: 'waiting_partner',
    coordination_version: 5,
    recoordination_count: 4
  })
  const fifthRoundPreview = await handlers.createPreviewForUser({
    coordination_id: 50,
    session_id: 100,
    changes: { budget: 'flexible' }
  }, tables.user[0])
  const fifthRoundHandoff = await handlers.confirmForUser({
    coordination_id: 50,
    patch_id: fifthRoundPreview.id
  }, tables.user[0])
  assert.strictEqual(fifthRoundHandoff.status, 'manual_handoff')
  assert.strictEqual(fifthRoundHandoff.coordination_version, 5)
  assert.strictEqual(tables.date_coordination[0].coordination_version, 5)
  assert.strictEqual(tables.date_coordination[0].recoordination_count, 4)
  await assert.rejects(
    () => handlers.createPreviewForUser({ coordination_id: 50, changes: { budget: 'under-50' } }, tables.user[0]),
    /已经结束/
  )
}

serviceChecks().then(() => {
  console.log('PASS - date application patch policy and service')
}).catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
