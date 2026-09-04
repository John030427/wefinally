'use strict'

const assert = require('assert')
const { executeQaPairReset, getQaPairResetStatus } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')
const { QA_PAIR_RESET_CONFIRM_TEXT } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetPolicy')
const { declaredPublicCode } = require('../../miniprogram/cloudfunctions/api/lib/publicErrorCodes')

function memoryDeps() {
  const rows = {
    user: [
      { _id: 'u1', id: 1, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'qa-real-device-registration-v1', match_status: 'idle', matched_partner_id: 0, is_vip: 1 },
      { _id: 'u2', id: 2, qa_test_run_enabled: true, profile_origin: 'real_user', qa_match_cohort: 'qa-real-device-registration-v1', match_status: 'idle', matched_partner_id: 0, is_vip: 1 }
    ],
    user_match_log: [],
    date_coordination: [],
    agent_session: [],
    agent_message: [],
    coordination_notification: [],
    date_coordination_event: [],
    date_coordination_application: [],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    date_application_patch: [],
    date_coordination_event_dedupe: [],
    date_participant: [],
    date_experience_feedback: [],
    fixture_response_job: [],
    controlled_date_scenario_run: [],
    coordination_notification_dedupe: [],
    agent_message_dedupe: [],
    agent_run: [],
    agent_tool_audit: [],
    agent_human_ticket: [],
    agent_notification_job: [],
    agent_session_dedupe: [],
    meet_report: [],
    meet_location_log: [],
    sos_log: [],
    match_experience_feedback: [],
    ai_report_task: [],
    match_handoff_ticket: [],
    match_claim: [],
    match_claim_audit: [],
    user_notification_cursor: [],
    qa_pair_reset_run: [],
    qa_pair_reset_audit: []
  }
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  let nextId = 1000
  let holdResolve
  const hold = new Promise((resolve) => { holdResolve = resolve })
  const deps = {
    rows,
    holdResolve,
    now: () => new Date('2026-09-04T00:00:00.000Z'),
    list: async (name, query, limit = 200) => (rows[name] || []).filter((row) => same(row, query)).slice(0, limit),
    listPage: async (name, query, afterId, limit = 100) => {
      const matched = (rows[name] || []).filter((row) => same(row, query))
        .sort((a, b) => String(a._id || '').localeCompare(String(b._id || '')))
      const start = afterId ? matched.findIndex((row) => String(row._id || '') === String(afterId)) + 1 : 0
      return matched.slice(Math.max(0, start), Math.max(0, start) + limit)
    },
    removeByDoc: async (name, row) => {
      const index = rows[name].findIndex((item) => item._id === row._id)
      if (index >= 0) rows[name].splice(index, 1)
      return { removed: 1 }
    },
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    acquireRun: async (data) => {
      const active = rows.qa_pair_reset_run.find((row) => row.pair_hash === data.pair_hash && row.status === 'deleting')
      if (active) return { created: false, run: active }
      const existing = rows.qa_pair_reset_run.find((row) => row.request_id === data.request_id && row.pair_hash === data.pair_hash)
      if (existing) return { created: false, run: existing }
      const run = Object.assign({ _id: `qa_pair_reset_active_${data.pair_hash}`, id: nextId++ }, data)
      rows.qa_pair_reset_run.push(run)
      return { created: true, run }
    },
    writeAudit: async (data) => {
      rows.qa_pair_reset_audit.push(Object.assign({ _id: `audit${nextId}`, id: nextId++ }, data))
    },
    beforeDeleteHook: async () => hold
  }
  return deps
}

async function main() {
  const deps = memoryDeps()
  const actor = deps.rows.user[0]
  const firstPromise = executeQaPairReset({
    confirmText: QA_PAIR_RESET_CONFIRM_TEXT,
    requestId: 'phone-a-req-1',
    actor
  }, deps)
  await new Promise((resolve) => setTimeout(resolve, 20))
  const second = await executeQaPairReset({
    confirmText: QA_PAIR_RESET_CONFIRM_TEXT,
    requestId: 'phone-b-req-2',
    actor: deps.rows.user[1]
  }, deps)
  assert.strictEqual(second.status, 'processing')
  assert.strictEqual(deps.rows.qa_pair_reset_run.filter((row) => row.status === 'deleting').length, 1)

  const status = await getQaPairResetStatus({ actor }, deps)
  assert.strictEqual(status.status, 'deleting')

  let matchBlocked = null
  try {
    const { assertQaPairResetNotBlockingMatch } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')
    await assertQaPairResetNotBlockingMatch({ actor }, deps)
  } catch (err) {
    matchBlocked = err
  }
  assert.ok(matchBlocked)
  assert.strictEqual(declaredPublicCode(matchBlocked), 'QA_PAIR_RESET_IN_PROGRESS')

  deps.holdResolve()
  const first = await firstPromise
  assert.strictEqual(first.status, 'completed')
  console.log('PASS qa pair reset concurrency shares one active lease')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
