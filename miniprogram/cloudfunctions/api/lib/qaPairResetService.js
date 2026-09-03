const { businessError } = require('./businessError')
const {
  assertConfirmText,
  resolveQaPair
} = require('./qaPairResetPolicy')

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/

function uniqueRows(rows) {
  const seen = new Set()
  return (rows || []).filter((row) => {
    const key = String(row && (row._id || row.id) || '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function collect(deps, name, queries, limit = 200) {
  const pages = await Promise.all((queries || []).map((query) => deps.list(name, query, limit)))
  return uniqueRows([].concat(...pages))
}

async function removeRows(deps, name, rows, counts) {
  const items = uniqueRows(rows)
  for (const row of items) await deps.removeByDoc(name, row)
  if (items.length) counts[name] = Number(counts[name] || 0) + items.length
}

function queriesFor(field, values) {
  return [...new Set((values || []).map((value) => Number(value)).filter((value) => value > 0))]
    .map((value) => ({ [field]: value }))
}

function stringQueries(field, values) {
  return [...new Set((values || []).map((value) => String(value || '')).filter(Boolean))]
    .map((value) => ({ [field]: value }))
}

async function deleteByQueries(deps, name, queries, counts) {
  const rows = await collect(deps, name, queries)
  await removeRows(deps, name, rows, counts)
  return rows
}

function resetUserPatch(timestamp) {
  return {
    match_status: 'idle',
    matched_partner_id: 0,
    matched_at: null,
    qa_match_run_id: '',
    qa_match_run_started_at: null,
    update_time: timestamp
  }
}

async function executeQaPairReset(input = {}, deps = {}) {
  assertConfirmText(input.confirmText)
  const requestId = String(input.requestId || '')
  if (!REQUEST_ID_RE.test(requestId)) {
    throw businessError('QA_PAIR_RESET_RETRYABLE', '重置请求编号无效，请重试')
  }
  const actor = input.actor || {}
  const cohort = String(actor.qa_match_cohort || 'qa-real-device-registration-v1')
  const candidates = await deps.list('user', { qa_match_cohort: cohort }, 20)
  const pair = resolveQaPair(actor, candidates)
  const timestamp = deps.now()
  const acquired = await deps.acquireRun({
    request_id: requestId,
    pair_hash: pair.pairHash,
    pair_key: pair.pairKey,
    actor_user_id: Number(actor.id),
    status: 'deleting',
    retry_count: 0,
    create_time: timestamp,
    update_time: timestamp
  })
  const run = acquired && acquired.run
  if (!run) throw businessError('QA_PAIR_RESET_RETRYABLE', '暂时无法创建重置任务，请重试')
  if (!acquired.created) {
    if (run.status === 'completed') {
      return { status: 'completed', idempotent: true, pair_hash: pair.pairHash, deleted_counts: run.deleted_counts || {} }
    }
    if (run.status !== 'failed_retryable') {
      return { status: 'processing', idempotent: true, pair_hash: pair.pairHash }
    }
    await deps.updateByDoc('qa_pair_reset_run', run, { status: 'deleting', retry_count: Number(run.retry_count || 0) + 1, update_time: timestamp })
  }

  const counts = {}
  try {
    const userIds = pair.userIds
    const matchLogs = await collect(deps, 'user_match_log', [
      ...queriesFor('user_id', userIds),
      ...queriesFor('match_user_id', userIds)
    ])
    const matchLogIds = matchLogs.map((row) => Number(row.id)).filter((id) => id > 0)
    const pairKeys = [...new Set([pair.pairKey, ...matchLogs.map((row) => row.pair_key)].filter(Boolean))]
    const coordinations = await collect(deps, 'date_coordination', [
      ...queriesFor('user_a_id', userIds),
      ...queriesFor('user_b_id', userIds),
      ...queriesFor('match_log_id', matchLogIds),
      ...stringQueries('pair_key', pairKeys)
    ])
    const coordinationIds = coordinations.map((row) => Number(row.id)).filter((id) => id > 0)
    const dateSessions = (await collect(deps, 'agent_session', queriesFor('coordination_id', coordinationIds)))
      .filter((row) => String(row.agent_type || '') === 'date_coordinator')
    const sessionIds = dateSessions.map((row) => Number(row.id)).filter((id) => id > 0)

    const coordinationChildren = [
      'date_coordination_confirmation',
      'date_coordination_proposal',
      'date_coordination_application',
      'date_application_patch',
      'date_coordination_event',
      'date_coordination_event_dedupe',
      'date_participant',
      'date_experience_feedback',
      'fixture_response_job',
      'controlled_date_scenario_run',
      'coordination_notification',
      'coordination_notification_dedupe'
    ]
    for (const name of coordinationChildren) {
      await deleteByQueries(deps, name, queriesFor('coordination_id', coordinationIds), counts)
    }

    const agentChildren = [
      'agent_message',
      'agent_message_dedupe',
      'agent_run',
      'agent_tool_audit',
      'agent_human_ticket',
      'agent_notification_job'
    ]
    for (const name of agentChildren) {
      await deleteByQueries(deps, name, [
        ...queriesFor('session_id', sessionIds),
        ...queriesFor('coordination_id', coordinationIds)
      ], counts)
    }
    await deleteByQueries(deps, 'agent_session_dedupe', [
      ...queriesFor('session_id', sessionIds),
      ...queriesFor('coordination_id', coordinationIds)
    ], counts)
    await removeRows(deps, 'agent_session', dateSessions, counts)

    const meetReports = await collect(deps, 'meet_report', [
      ...queriesFor('match_log_id', matchLogIds),
      ...queriesFor('user_id', userIds),
      ...queriesFor('match_user_id', userIds)
    ])
    const meetReportIds = meetReports.map((row) => Number(row.id)).filter((id) => id > 0)
    await deleteByQueries(deps, 'meet_location_log', queriesFor('meet_report_id', meetReportIds), counts)
    await deleteByQueries(deps, 'sos_log', queriesFor('meet_report_id', meetReportIds), counts)
    await removeRows(deps, 'meet_report', meetReports, counts)

    const matchChildren = [
      'match_experience_feedback',
      'ai_report_task',
      'match_handoff_ticket'
    ]
    for (const name of matchChildren) {
      await deleteByQueries(deps, name, [
        ...queriesFor('match_log_id', matchLogIds),
        ...queriesFor('user_id', userIds)
      ], counts)
    }
    await deleteByQueries(deps, 'match_claim', stringQueries('pair_key', pairKeys), counts)
    await deleteByQueries(deps, 'match_claim_audit', stringQueries('pair_key', pairKeys), counts)
    await removeRows(deps, 'date_coordination', coordinations, counts)
    await removeRows(deps, 'user_match_log', matchLogs, counts)

    for (const user of pair.users) {
      await deps.updateByDoc('user', user, resetUserPatch(timestamp))
    }
    const cursors = await collect(deps, 'user_notification_cursor', queriesFor('user_id', userIds), 20)
    for (const cursor of cursors) {
      const remaining = await deps.list('coordination_notification', { user_id: Number(cursor.user_id) }, 100)
      const unread = remaining.filter((row) => !row.read_at && Number(row.is_read || 0) !== 1).length
      await deps.updateByDoc('user_notification_cursor', cursor, { unread_count: unread, update_time: timestamp })
    }

    await deps.writeAudit({
      request_id: requestId,
      pair_hash: pair.pairHash,
      actor_user_id: Number(actor.id),
      status: 'completed',
      deleted_counts: counts,
      create_time: timestamp
    })
    await deps.updateByDoc('qa_pair_reset_run', run, {
      status: 'completed',
      deleted_counts: counts,
      completed_at: timestamp,
      update_time: timestamp
    })
    return { status: 'completed', idempotent: false, pair_hash: pair.pairHash, deleted_counts: counts }
  } catch (error) {
    await deps.updateByDoc('qa_pair_reset_run', run, {
      status: 'failed_retryable',
      error_code: String(error && error.code || 'QA_PAIR_RESET_RETRYABLE'),
      update_time: deps.now()
    })
    throw error
  }
}

module.exports = { executeQaPairReset }
