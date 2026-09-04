'use strict'

const assert = require('assert')
const {
  executeQaPairReset,
  getQaPairResetStatus,
  assertQaPairResetNotBlockingMatch
} = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')
const {
  QA_PAIR_RESET_CONFIRM_TEXT,
  resolveQaPair
} = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetPolicy')

const COHORT = 'qa-real-device-registration-v1'

function qaUsers() {
  return [
    {
      _id: 'user_1',
      id: 1,
      openid: 'qa-a',
      account_mode: 'internal_qa',
      profile_origin: 'real_user',
      qa_match_cohort: COHORT,
      match_status: 'matched',
      matched_partner_id: 2,
      nickname: '保留资料 A'
    },
    {
      _id: 'user_2',
      id: 2,
      openid: 'qa-b',
      qa_test_run_enabled: true,
      profile_origin: 'real_user',
      qa_match_cohort: COHORT,
      match_status: 'matched',
      matched_partner_id: 1,
      nickname: '保留资料 B'
    }
  ]
}

function memoryDeps({ holdBeforeDelete = false } = {}) {
  const rows = {
    user: qaUsers(),
    user_match_setting: [{ _id: 'setting_1', id: 11, user_id: 1, self_view_text: '保留画像' }],
    user_order: [{ _id: 'order_1', id: 12, user_id: 1, status: 'paid' }],
    ai_chat_log: [{ _id: 'love_1', id: 13, user_id: 1, content: '普通恋爱助手历史' }],
    user_match_log: [
      { _id: 'match_1', id: 21, user_id: 1, match_user_id: 2, pair_key: '1:2' },
      { _id: 'match_2', id: 22, user_id: 2, match_user_id: 1, pair_key: '1:2' }
    ],
    date_coordination: [{ _id: 'coord_1', id: 31, pair_key: '1:2', user_a_id: 1, user_b_id: 2, match_log_id: 21 }],
    agent_session: [
      { _id: 'session_1', id: 41, user_id: 1, coordination_id: 31, agent_type: 'date_coordinator', status: 'active' },
      { _id: 'session_2', id: 42, user_id: 2, coordination_id: 31, agent_type: 'date_coordinator', status: 'active' }
    ],
    agent_message: [],
    coordination_notification: [],
    date_coordination_event: [],
    date_coordination_application: [{ _id: 'application_1', id: 51, coordination_id: 31 }],
    date_coordination_proposal: [{ _id: 'proposal_1', id: 52, coordination_id: 31 }],
    date_coordination_confirmation: [{ _id: 'confirmation_1', id: 53, coordination_id: 31 }],
    date_application_patch: [{ _id: 'patch_1', id: 54, coordination_id: 31 }],
    date_coordination_event_dedupe: [{ _id: 'event_dedupe_1', id: 55, coordination_id: 31 }],
    coordination_projection_outbox: [{ _id: 'projection_1', id: 56, coordination_id: 31 }],
    agent_message_dedupe: [{ _id: 'message_dedupe_1', id: 57, session_id: 41 }],
    agent_run: [{ _id: 'run_1', id: 58, session_id: 41 }],
    agent_tool_audit: [{ _id: 'tool_1', id: 59, session_id: 41 }],
    agent_human_ticket: [{ _id: 'ticket_1', id: 60, session_id: 41 }],
    agent_notification_job: [{ _id: 'job_1', id: 61, session_id: 41 }],
    agent_session_dedupe: [{ _id: 'session_dedupe_1', id: 62, session_id: 41 }],
    coordination_notification_dedupe: [{ _id: 'notification_dedupe_1', id: 63, coordination_id: 31 }],
    date_participant: [{ _id: 'participant_1', id: 64, coordination_id: 31 }],
    date_experience_feedback: [{ _id: 'date_feedback_1', id: 65, coordination_id: 31 }],
    match_experience_feedback: [{ _id: 'match_feedback_1', id: 66, match_log_id: 21 }],
    ai_report_task: [{ _id: 'report_1', id: 67, match_log_id: 21 }],
    match_handoff_ticket: [{ _id: 'handoff_1', id: 68, match_log_id: 21 }],
    match_claim: [{ _id: 'claim_1', id: 69, pair_key: '1:2' }],
    match_claim_audit: [{ _id: 'claim_audit_1', id: 70, pair_key: '1:2' }],
    meet_report: [{ _id: 'meet_1', id: 71, match_log_id: 21, user_id: 1 }],
    meet_location_log: [{ _id: 'location_1', id: 72, meet_report_id: 71 }],
    sos_log: [{ _id: 'sos_1', id: 73, meet_report_id: 71 }],
    fixture_response_job: [{ _id: 'fixture_1', id: 74, coordination_id: 31 }],
    controlled_date_scenario_run: [{ _id: 'scenario_1', id: 75, coordination_id: 31 }],
    user_notification_cursor: [
      { _id: 'cursor_1', id: 81, user_id: 1, unread_count: 501 },
      { _id: 'cursor_2', id: 82, user_id: 2, unread_count: 0 }
    ],
    qa_pair_reset_run: [],
    qa_pair_reset_audit: []
  }
  for (let index = 0; index < 501; index += 1) {
    const suffix = String(index).padStart(4, '0')
    rows.agent_message.push({ _id: `message_${suffix}`, id: 1000 + index, session_id: 41 })
    rows.coordination_notification.push({ _id: `notification_${suffix}`, id: 2000 + index, coordination_id: 31, user_id: 1 })
    rows.date_coordination_event.push({ _id: `event_${suffix}`, id: 3000 + index, coordination_id: 31 })
  }
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  let nextId = 9000
  let releaseDelete
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve })
  const deps = {
    rows,
    now: () => new Date('2026-09-04T00:00:00.000Z'),
    list: async (name, query, limit = 200) => (rows[name] || [])
      .filter((row) => same(row, query))
      .sort((left, right) => String(left._id || '').localeCompare(String(right._id || '')))
      .slice(0, Math.max(1, Math.min(Number(limit || 200), 200))),
    listPage: async (name, query, afterId, limit = 100) => {
      const matched = (rows[name] || [])
        .filter((row) => same(row, query))
        .sort((left, right) => String(left._id || '').localeCompare(String(right._id || '')))
      const start = afterId ? matched.findIndex((row) => String(row._id) === String(afterId)) + 1 : 0
      return matched.slice(Math.max(0, start), Math.max(0, start) + Math.min(Number(limit || 100), 100))
    },
    removeByDoc: async (name, row) => {
      const index = (rows[name] || []).findIndex((item) => item._id === row._id)
      if (index >= 0) rows[name].splice(index, 1)
      return { removed: index >= 0 ? 1 : 0 }
    },
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    acquireRun: async (data) => {
      const documentId = `qa_pair_reset_active_${data.pair_hash}`
      const current = rows.qa_pair_reset_run.find((row) => row._id === documentId)
      if (current) {
        if (current.status === 'completed' && current.request_id === data.request_id) return { created: false, run: current }
        if (['deleting', 'processing'].includes(current.status)) return { created: false, run: current }
      }
      const run = Object.assign({}, data, { _id: documentId, id: nextId++ })
      const index = rows.qa_pair_reset_run.findIndex((row) => row._id === documentId)
      if (index >= 0) rows.qa_pair_reset_run[index] = run
      else rows.qa_pair_reset_run.push(run)
      return { created: true, run }
    },
    writeAudit: async (record) => rows.qa_pair_reset_audit.push(Object.assign({ id: nextId++ }, record)),
    beforeDeleteHook: holdBeforeDelete ? async () => deleteGate : undefined
  }
  return { deps, releaseDelete }
}

async function resetInput(actor, requestId) {
  return {
    actor,
    requestId,
    confirmText: QA_PAIR_RESET_CONFIRM_TEXT
  }
}

async function main() {
  const firstRun = memoryDeps()
  const result = await executeQaPairReset(await resetInput(firstRun.deps.rows.user[0], 'qa-reset-request-001'), firstRun.deps)
  assert.strictEqual(result.status, 'completed')
  assert.strictEqual(result.idempotent, false)
  assert.strictEqual(firstRun.deps.rows.agent_message.length, 0)
  assert.strictEqual(firstRun.deps.rows.coordination_notification.length, 0)
  assert.strictEqual(firstRun.deps.rows.date_coordination_event.length, 0)
  assert.strictEqual(firstRun.deps.rows.date_coordination.length, 0)
  assert.strictEqual(firstRun.deps.rows.user[0].match_status, 'idle')
  assert.strictEqual(firstRun.deps.rows.user[1].matched_partner_id, 0)
  assert.strictEqual(firstRun.deps.rows.user[0].nickname, '保留资料 A')
  assert.strictEqual(firstRun.deps.rows.user_match_setting.length, 1)
  assert.strictEqual(firstRun.deps.rows.ai_chat_log.length, 1)
  assert.strictEqual(firstRun.deps.rows.user_notification_cursor[0].unread_count, 0)
  assert(firstRun.deps.rows.qa_pair_reset_audit.length === 1)
  assert(Number(result.deleted_counts.agent_message) >= 501)

  const repeated = await executeQaPairReset(await resetInput(firstRun.deps.rows.user[0], 'qa-reset-request-001'), firstRun.deps)
  assert.strictEqual(repeated.status, 'completed')
  assert.strictEqual(repeated.idempotent, true)
  assert.strictEqual(firstRun.deps.rows.qa_pair_reset_audit.length, 1)

  const concurrent = memoryDeps({ holdBeforeDelete: true })
  const firstPromise = executeQaPairReset(await resetInput(concurrent.deps.rows.user[0], 'qa-reset-phone-a-01'), concurrent.deps)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const second = await executeQaPairReset(await resetInput(concurrent.deps.rows.user[1], 'qa-reset-phone-b-02'), concurrent.deps)
  assert.strictEqual(second.status, 'processing')
  assert.strictEqual((await getQaPairResetStatus({ actor: concurrent.deps.rows.user[0] }, concurrent.deps)).status, 'deleting')
  await assert.rejects(
    () => assertQaPairResetNotBlockingMatch({ actor: concurrent.deps.rows.user[0] }, concurrent.deps),
    (error) => error && error.errorCode === 'QA_PAIR_RESET_IN_PROGRESS'
  )
  concurrent.releaseDelete()
  assert.strictEqual((await firstPromise).status, 'completed')

  const resolved = resolveQaPair({ id: 1, qa_match_cohort: COHORT }, [
    ...qaUsers(),
    { _id: 'fixture', id: 3, qa_match_cohort: COHORT, profile_origin: 'synthetic_fixture', is_test_fixture: 1 }
  ])
  assert.deepStrictEqual(resolved.userIds, [1, 2])
  await assert.rejects(
    () => executeQaPairReset({ actor: qaUsers()[0], requestId: 'short', confirmText: '确认' }, firstRun.deps),
    (error) => error && ['QA_PAIR_RESET_CONFIRM_REQUIRED', 'QA_PAIR_RESET_RETRYABLE'].includes(error.errorCode)
  )
  console.log('PASS QA pair reset is scoped, paginated, idempotent, and mutually exclusive')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
