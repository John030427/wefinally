const assert = require('assert')

const {
  CONTROLLED_PATCH_REQUEST,
  createControlledDateScenarioService
} = require('../../miniprogram/cloudfunctions/api/agent/controlledDateScenarioService')

function fixture() {
  const tables = {
    controlled_date_scenario_run: [], user: [], user_match_log: [], date_coordination: [],
    date_coordination_application: [], date_coordination_proposal: [], date_coordination_confirmation: [],
    agent_session: [], agent_run: [], agent_tool_call: []
  }
  let next = 100
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    tables,
    now: () => new Date('2026-08-15T06:00:00.000Z'),
    list: async (name, query = {}) => (tables[name] || []).filter((row) => matches(row, query)),
    first: async (name, query = {}) => {
      const row = (tables[name] || []).find((item) => matches(item, query)) || null
      return row && name === 'controlled_date_scenario_run' ? { ...row } : row
    },
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      const row = { _id: `${name}_${++next}`, id: next, ...data }
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => {
      const stored = (tables[name] || []).find((item) => item._id === row._id) || row
      Object.assign(stored, data)
    }
  }
  const services = {
    bootstrap: async ({ run, userA, userB }) => {
      const coordination = await deps.addWithId('date_coordination', {
        user_a_id: userA.id, user_b_id: userB.id, status: 'collecting_initiator', coordination_version: 1
      })
      const sessionA = await deps.addWithId('agent_session', { user_id: userA.id, coordination_id: coordination.id, agent_type: 'date_coordinator' })
      const sessionB = await deps.addWithId('agent_session', { user_id: userB.id, coordination_id: coordination.id, agent_type: 'date_coordinator' })
      return { coordination, sessionA, sessionB, run }
    },
    submitApplications: async ({ run }) => {
      for (const userId of [run.user_a_id, run.user_b_id]) await deps.addWithId('date_coordination_application', {
        coordination_id: run.coordination_id, user_id: userId, coordination_version: 1, application: { areas: ['福田区'] }
      })
    },
    processProposal: async ({ run }) => {
      const coordination = await deps.byId('date_coordination', run.coordination_id)
      coordination.status = 'waiting_confirmations'
      return deps.addWithId('date_coordination_proposal', {
        coordination_id: coordination.id, coordination_version: coordination.coordination_version, status: 'active'
      })
    },
    requestPatch: async ({ run }) => {
      await deps.addWithId('agent_run', { session_id: run.session_a_id, provider: 'langgraph', status: 'completed' })
      await deps.addWithId('agent_tool_call', { session_id: run.session_a_id, tool_name: 'create_date_application_patch', status: 'completed' })
      return { patch_id: 701 }
    },
    applyPatch: async ({ run }) => {
      const coordination = await deps.byId('date_coordination', run.coordination_id)
      coordination.coordination_version += 1
      coordination.status = 'computing_overlap'
    },
    confirmBoth: async ({ run }) => {
      const coordination = await deps.byId('date_coordination', run.coordination_id)
      const proposal = (await deps.list('date_coordination_proposal', { coordination_id: coordination.id })).at(-1)
      for (const userId of [run.user_a_id, run.user_b_id]) await deps.addWithId('date_coordination_confirmation', {
        coordination_id: coordination.id, coordination_version: coordination.coordination_version,
        proposal_id: proposal.id, user_id: userId, decision: 'confirm'
      })
      coordination.status = 'arranged'
    }
  }
  return { deps, services }
}

async function main() {
  assert(CONTROLLED_PATCH_REQUEST.includes('create_date_application_patch'))
  assert(CONTROLLED_PATCH_REQUEST.includes('activities'))
  const { deps, services } = fixture()
  const service = createControlledDateScenarioService(deps, services)
  const admin = { role: 'admin', admin_role: 'super_admin', id: 1 }
  const run = await service.createRun(admin, { run_id: 'wf-date-e2e-20260815-01' })
  assert.strictEqual(deps.tables.user.length, 2)
  assert(deps.tables.user.every((user) => user.account_mode === 'internal_qa'))
  assert(deps.tables.user.every((user) => user.profile_origin === 'controlled_date_scenario'))
  assert(deps.tables.user.every((user) => user.formal_match_hidden === 1 && user.is_test_fixture === 1))
  assert.strictEqual(deps.tables.user_match_log.length, 2)
  assert.strictEqual(deps.tables.agent_session.length, 2)
  await assert.rejects(() => service.createRun({ role: 'admin', admin_role: 'customer_service', id: 2 }, { run_id: 'denied' }), /无权/)

  let current = run
  current = await service.advanceRun(admin, current.run_id)
  assert.strictEqual(current.step, 'applications_submitted')
  for (let index = 1; index < 7; index += 1) current = await service.advanceRun(admin, current.run_id)
  assert.strictEqual(current.status, 'passed')
  assert.strictEqual(current.step, 'passed')
  assert.strictEqual((await deps.byId('date_coordination', current.coordination_id)).status, 'arranged')
  assert.strictEqual((await deps.list('date_coordination_application', { coordination_id: current.coordination_id, coordination_version: 1 })).length, 2)
  assert((await deps.list('agent_run', { provider: 'langgraph' })).length >= 1)
  assert((await deps.list('agent_tool_call', { tool_name: 'create_date_application_patch' })).length >= 1)
  assert.strictEqual((await service.advanceRun(admin, current.run_id)).status, 'passed')

  const raced = fixture()
  const racedService = createControlledDateScenarioService(raced.deps, raced.services)
  let racedRun = await racedService.createRun(admin, { run_id: 'wf-date-e2e-race-20260815' })
  racedRun = await racedService.advanceRun(admin, racedRun.run_id)
  const racedCoordination = await raced.deps.byId('date_coordination', racedRun.coordination_id)
  racedCoordination.status = 'waiting_confirmations'
  racedCoordination.processing_status = 'completed'
  raced.services.processProposal = async () => { throw new Error('worker should not rerun completed proposal') }
  racedRun = await racedService.advanceRun(admin, racedRun.run_id)
  assert.strictEqual(racedRun.step, 'first_proposal')

  console.log('PASS controlled bilateral date LangGraph E2E service')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
