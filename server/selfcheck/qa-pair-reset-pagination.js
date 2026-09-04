'use strict'

const assert = require('assert')
const { executeQaPairReset } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')
const { QA_PAIR_RESET_CONFIRM_TEXT } = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetPolicy')

function memoryDeps() {
  const rows = {
    user: [
      { _id: 'u1', id: 1, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'qa-real-device-registration-v1', match_status: 'matched', matched_partner_id: 2, is_vip: 1 },
      { _id: 'u2', id: 2, qa_test_run_enabled: true, profile_origin: 'real_user', qa_match_cohort: 'qa-real-device-registration-v1', match_status: 'matched', matched_partner_id: 1, is_vip: 1 }
    ],
    user_match_log: [
      { _id: 'm1', id: 10, user_id: 1, match_user_id: 2, pair_key: '1:2' },
      { _id: 'm2', id: 11, user_id: 2, match_user_id: 1, pair_key: '1:2' }
    ],
    date_coordination: [{ _id: 'd1', id: 90, pair_key: '1:2', user_a_id: 1, user_b_id: 2, match_log_id: 10 }],
    agent_session: [
      { _id: 'as1', id: 50, coordination_id: 90, user_id: 1, agent_type: 'date_coordinator' },
      { _id: 'as2', id: 51, coordination_id: 90, user_id: 2, agent_type: 'date_coordinator' }
    ],
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
    user_notification_cursor: [
      { _id: 'cursor1', user_id: 1, unread_count: 0 },
      { _id: 'cursor2', user_id: 2, unread_count: 0 }
    ],
    qa_pair_reset_run: [],
    qa_pair_reset_audit: []
  }
  for (let i = 0; i < 501; i += 1) {
    rows.agent_message.push({ _id: `am_${String(i).padStart(4, '0')}`, id: 1000 + i, session_id: 50, content: `msg-${i}` })
    rows.coordination_notification.push({ _id: `n_${String(i).padStart(4, '0')}`, id: 2000 + i, coordination_id: 90, user_id: 1 })
    rows.date_coordination_event.push({ _id: `e_${String(i).padStart(4, '0')}`, id: 3000 + i, coordination_id: 90 })
  }
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  let nextId = 9000
  return {
    rows,
    now: () => new Date('2026-09-04T00:00:00.000Z'),
    list: async (name, query, limit = 200) => {
      const matched = (rows[name] || []).filter((row) => same(row, query))
        .sort((a, b) => String(a._id || '').localeCompare(String(b._id || '')))
      return matched.slice(0, Math.max(1, Math.min(Number(limit || 200), 200)))
    },
    listPage: async (name, query, afterId, limit = 100) => {
      const matched = (rows[name] || []).filter((row) => same(row, query))
        .sort((a, b) => String(a._id || '').localeCompare(String(b._id || '')))
      const start = afterId
        ? matched.findIndex((row) => String(row._id || '') === String(afterId)) + 1
        : 0
      return matched.slice(Math.max(0, start), Math.max(0, start) + Math.max(1, Math.min(Number(limit || 100), 100)))
    },
    removeByDoc: async (name, row) => {
      const index = rows[name].findIndex((item) => item._id === row._id)
      if (index < 0) throw new Error('记录删除失败')
      rows[name].splice(index, 1)
      return { removed: 1 }
    },
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    acquireRun: async (data) => {
      const active = rows.qa_pair_reset_run.find((row) => row.pair_hash === data.pair_hash && ['deleting', 'processing'].includes(row.status))
      if (active) return { created: false, run: active }
      const existing = rows.qa_pair_reset_run.find((row) => row.request_id === data.request_id && row.pair_hash === data.pair_hash)
      if (existing) return { created: false, run: existing }
      const run = Object.assign({ _id: `reset${nextId}`, id: nextId++ }, data)
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
  const result = await executeQaPairReset({
    confirmText: QA_PAIR_RESET_CONFIRM_TEXT,
    requestId: 'pagination-req-001',
    actor: deps.rows.user[0]
  }, deps)
  assert.strictEqual(result.status, 'completed')
  const remainingMessages = deps.rows.agent_message.filter((row) => Number(row.session_id) === 50).length
  const remainingNotifications = deps.rows.coordination_notification.filter((row) => Number(row.coordination_id) === 90).length
  const remainingEvents = deps.rows.date_coordination_event.filter((row) => Number(row.coordination_id) === 90).length
  assert.strictEqual(remainingMessages, 0)
  assert.strictEqual(remainingNotifications, 0)
  assert.strictEqual(remainingEvents, 0)
  console.log('PASS qa pair reset pagination clears beyond 200 rows')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
