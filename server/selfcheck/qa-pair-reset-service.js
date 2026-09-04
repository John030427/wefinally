const assert = require('assert')
const { executeQaPairReset } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')
const { QA_PAIR_RESET_CONFIRM_TEXT } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetPolicy')

function memoryDeps() {
  const rows = {
    user: [
      { _id: 'u1', id: 1, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'qa-real-device-registration-v1', match_status: 'matched', matched_partner_id: 2, is_vip: 1 },
      { _id: 'u2', id: 2, qa_test_run_enabled: true, profile_origin: 'real_user', qa_match_cohort: 'qa-real-device-registration-v1', match_status: 'matched', matched_partner_id: 1, is_vip: 1 }
    ],
    user_match_setting: [{ _id: 's1', user_id: 1 }, { _id: 's2', user_id: 2 }],
    user_evidence_chunk: [{ _id: 'e1', user_id: 1 }, { _id: 'e2', user_id: 2 }],
    user_order: [{ _id: 'o1', user_id: 1, pay_status: 1 }],
    partner_referral_attribution: [{ _id: 'r1', user_id: 1 }],
    partner_commission_ledger: [{ _id: 'l1', user_id: 1 }],
    user_match_log: [
      { _id: 'm1', id: 10, user_id: 1, match_user_id: 2, pair_key: '1:2' },
      { _id: 'm2', id: 11, user_id: 2, match_user_id: 1, pair_key: '1:2' }
    ],
    match_claim: [{ _id: 'c1', pair_key: '1:2' }],
    match_claim_audit: [{ _id: 'ca1', pair_key: '1:2' }],
    match_experience_feedback: [{ _id: 'mf1', match_log_id: 10, user_id: 1 }],
    ai_report_task: [{ _id: 'ar1', match_log_id: 10, user_id: 1 }],
    meet_report: [{ _id: 'meet1', id: 70, match_log_id: 10, user_id: 1, match_user_id: 2 }],
    meet_location_log: [{ _id: 'loc1', meet_report_id: 70, user_id: 1 }],
    sos_log: [{ _id: 'sos1', meet_report_id: 70, user_id: 1 }],
    date_coordination: [{ _id: 'd1', id: 90, pair_key: '1:2', user_a_id: 1, user_b_id: 2, match_log_id: 10 }],
    date_coordination_application: [{ _id: 'da1', coordination_id: 90 }],
    date_coordination_proposal: [{ _id: 'dp1', coordination_id: 90 }],
    date_coordination_confirmation: [{ _id: 'dc1', coordination_id: 90 }],
    date_application_patch: [{ _id: 'dap1', coordination_id: 90 }],
    date_coordination_event: [{ _id: 'de1', coordination_id: 90 }],
    date_coordination_event_dedupe: [{ _id: 'ded1', coordination_id: 90 }],
    date_participant: [{ _id: 'part1', coordination_id: 90 }],
    date_experience_feedback: [{ _id: 'df1', coordination_id: 90 }],
    fixture_response_job: [{ _id: 'fj1', coordination_id: 90 }],
    coordination_notification: [{ _id: 'n1', id: 7, coordination_id: 90, user_id: 2 }],
    coordination_notification_dedupe: [{ _id: 'nd1', coordination_id: 90 }],
    agent_session: [
      { _id: 'as1', id: 50, coordination_id: 90, user_id: 1, agent_type: 'date_coordinator' },
      { _id: 'as2', id: 51, user_id: 1, agent_type: 'love_advisor' }
    ],
    agent_session_dedupe: [{ _id: 'asd1', coordination_id: 90, session_id: 50 }],
    agent_message: [{ _id: 'am1', session_id: 50 }, { _id: 'am2', session_id: 51 }],
    agent_message_dedupe: [{ _id: 'amd1', session_id: 50 }],
    agent_run: [{ _id: 'run1', session_id: 50, coordination_id: 90 }],
    agent_tool_audit: [{ _id: 'tool1', session_id: 50, coordination_id: 90 }],
    agent_human_ticket: [{ _id: 'ticket1', session_id: 50, coordination_id: 90 }],
    agent_notification_job: [{ _id: 'job1', session_id: 50, coordination_id: 90 }],
    match_handoff_ticket: [{ _id: 'handoff1', match_log_id: 10, user_id: 1 }],
    user_notification_cursor: [{ _id: 'cursor1', user_id: 1, unread_count: 3 }, { _id: 'cursor2', user_id: 2, unread_count: 2 }],
    qa_pair_reset_run: [],
    qa_pair_reset_audit: []
  }
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  let nextId = 1000
  return {
    rows,
    now: () => new Date('2026-09-04T00:00:00.000Z'),
    list: async (name, query) => (rows[name] || []).filter((row) => same(row, query)),
    removeByDoc: async (name, row) => {
      const index = rows[name].findIndex((item) => item._id === row._id)
      if (index < 0) throw new Error('记录删除失败')
      rows[name].splice(index, 1)
      return { removed: 1 }
    },
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    acquireRun: async (data) => {
      const active = rows.qa_pair_reset_run.find((row) => row.pair_hash === data.pair_hash && ['deleting', 'processing'].includes(String(row.status || '')))
      if (active) return { created: false, run: active }
      const existing = rows.qa_pair_reset_run.find((row) => row.request_id === data.request_id && row.pair_hash === data.pair_hash)
      if (existing) return { created: false, run: existing }
      const run = Object.assign({ _id: `qa_pair_reset_active_${data.pair_hash}`, id: nextId++ }, data)
      rows.qa_pair_reset_run.push(run)
      return { created: true, run }
    },
    writeAudit: async (data) => {
      rows.qa_pair_reset_audit.push(Object.assign({ _id: `audit${nextId}`, id: nextId++ }, data))
    }
  }
}

async function main() {
  const deps = memoryDeps()
  const request = {
    actor: deps.rows.user[0],
    requestId: 'qa-pair-reset-0001',
    confirmText: QA_PAIR_RESET_CONFIRM_TEXT
  }
  const result = await executeQaPairReset(request, deps)
  assert.strictEqual(result.status, 'completed')
  assert.strictEqual(deps.rows.user.length, 2)
  assert.strictEqual(deps.rows.user_match_setting.length, 2)
  assert.strictEqual(deps.rows.user_evidence_chunk.length, 2)
  assert.strictEqual(deps.rows.user_order.length, 1)
  assert.strictEqual(deps.rows.partner_referral_attribution.length, 1)
  assert.strictEqual(deps.rows.partner_commission_ledger.length, 1)
  assert.strictEqual(deps.rows.user_match_log.length, 0)
  assert.strictEqual(deps.rows.meet_report.length, 0)
  assert.strictEqual(deps.rows.meet_location_log.length, 0)
  assert.strictEqual(deps.rows.sos_log.length, 0)
  assert.strictEqual(deps.rows.date_coordination.length, 0)
  assert.strictEqual(deps.rows.agent_session.length, 1)
  assert.strictEqual(deps.rows.agent_session[0].agent_type, 'love_advisor')
  assert.strictEqual(deps.rows.agent_message.length, 1)
  assert.strictEqual(deps.rows.agent_message[0].session_id, 51)
  assert.strictEqual(deps.rows.user[0].match_status, 'idle')
  assert.strictEqual(deps.rows.user[1].matched_partner_id, 0)
  assert.strictEqual(deps.rows.qa_pair_reset_audit.length, 1)
  assert.strictEqual(JSON.stringify(deps.rows.qa_pair_reset_audit).includes('openid'), false)
  const repeated = await executeQaPairReset(request, deps)
  assert.strictEqual(repeated.status, 'completed')
  assert.strictEqual(repeated.idempotent, true)
  assert.strictEqual(deps.rows.qa_pair_reset_audit.length, 1)
  console.log('PASS resumable QA pair reset preserves account value data')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
