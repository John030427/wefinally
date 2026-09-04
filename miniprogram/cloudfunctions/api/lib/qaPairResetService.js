'use strict'

const {
  assertConfirmText,
  qaError,
  resolveQaPair,
  DEFAULT_QA_COHORT
} = require('./qaPairResetPolicy')

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/
const PAGE_SIZE = 100

function uniqueRows(rows) {
  const seen = new Set()
  return (rows || []).filter((row) => {
    const key = String(row && (row._id || row.id) || '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function listPage(deps, name, query, afterId, limit = PAGE_SIZE) {
  const pageLimit = Math.max(1, Math.min(Number(limit || PAGE_SIZE), PAGE_SIZE))
  if (typeof deps.listPage === 'function') return deps.listPage(name, query, afterId, pageLimit)
  const rows = await deps.list(name, query, 1000)
  const sorted = (rows || []).slice().sort((left, right) => String(left._id || '').localeCompare(String(right._id || '')))
  const start = afterId
    ? sorted.findIndex((row) => String(row._id || '') === String(afterId)) + 1
    : 0
  return sorted.slice(Math.max(0, start), Math.max(0, start) + pageLimit)
}

async function collect(deps, name, queries) {
  const all = []
  for (const query of queries || []) {
    let afterId = ''
    for (;;) {
      const page = await listPage(deps, name, query, afterId || null, PAGE_SIZE)
      if (!page.length) break
      all.push(...page)
      afterId = String(page[page.length - 1]._id || page[page.length - 1].id || '')
      if (!afterId || page.length < PAGE_SIZE) break
    }
  }
  return uniqueRows(all)
}

async function removeRows(deps, name, rows, counts) {
  const items = uniqueRows(rows)
  for (const row of items) await deps.removeByDoc(name, row)
  if (items.length) counts[name] = Number(counts[name] || 0) + items.length
}

function numericQueries(field, values) {
  return [...new Set((values || []).map((value) => Number(value)).filter((value) => value > 0))]
    .map((value) => ({ [field]: value }))
}

function stringQueries(field, values) {
  return [...new Set((values || []).map((value) => String(value || '')).filter(Boolean))]
    .map((value) => ({ [field]: value }))
}

async function deleteByQueries(deps, name, queries, counts) {
  for (const query of queries || []) {
    for (;;) {
      const page = await listPage(deps, name, query, null, PAGE_SIZE)
      if (!page.length) break
      await removeRows(deps, name, page, counts)
    }
  }
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

async function resolvePairFromActor(deps, actor) {
  const cohort = String(actor && actor.qa_match_cohort || DEFAULT_QA_COHORT)
  const candidates = await deps.list('user', { qa_match_cohort: cohort }, 20)
  return resolveQaPair(actor, candidates)
}

async function getQaPairResetStatus(input = {}, deps = {}) {
  const pair = await resolvePairFromActor(deps, input.actor || {})
  const runs = await deps.list('qa_pair_reset_run', { pair_hash: pair.pairHash }, 20)
  const active = (runs || [])
    .filter((row) => ['deleting', 'processing'].includes(String(row.status || '')))
    .sort((left, right) => new Date(right.update_time || 0).getTime() - new Date(left.update_time || 0).getTime())[0]
  if (active) {
    return {
      status: String(active.status || 'deleting'),
      pair_hash: pair.pairHash,
      request_id: active.request_id || '',
      deleted_counts: active.deleted_counts || {}
    }
  }
  const completed = (runs || [])
    .filter((row) => String(row.status || '') === 'completed')
    .sort((left, right) => new Date(right.completed_at || right.update_time || 0).getTime() - new Date(left.completed_at || left.update_time || 0).getTime())[0]
  if (completed) {
    return {
      status: 'completed',
      pair_hash: pair.pairHash,
      request_id: completed.request_id || '',
      deleted_counts: completed.deleted_counts || {}
    }
  }
  return { status: 'idle', pair_hash: pair.pairHash }
}

async function assertQaPairResetNotBlockingMatch(input = {}, deps = {}) {
  try {
    const status = await getQaPairResetStatus(input, deps)
    if (['deleting', 'processing'].includes(String(status.status || ''))) {
      throw qaError('QA_PAIR_RESET_IN_PROGRESS', '双账号清理进行中，请稍后再匹配', 409)
    }
    return status
  } catch (error) {
    // A QA account may enter the match screen before its pair is provisioned.
    if (error && error.errorCode === 'QA_PAIR_RESET_AMBIGUOUS') return { status: 'idle' }
    throw error
  }
}

async function executeQaPairReset(input = {}, deps = {}) {
  assertConfirmText(input.confirmText)
  const requestId = String(input.requestId || '')
  if (!REQUEST_ID_RE.test(requestId)) throw qaError('QA_PAIR_RESET_RETRYABLE', '重置请求编号无效，请重试', 400)
  const actor = input.actor || {}
  const pair = await resolvePairFromActor(deps, actor)
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
  if (!run) throw qaError('QA_PAIR_RESET_RETRYABLE', '暂时无法创建重置任务，请重试')
  if (!acquired.created) {
    if (run.status === 'completed' && run.request_id === requestId) {
      return { status: 'completed', idempotent: true, pair_hash: pair.pairHash, deleted_counts: run.deleted_counts || {} }
    }
    if (run.status !== 'failed_retryable') {
      return { status: 'processing', idempotent: true, pair_hash: pair.pairHash }
    }
    await deps.updateByDoc('qa_pair_reset_run', run, {
      status: 'deleting',
      retry_count: Number(run.retry_count || 0) + 1,
      request_id: requestId,
      update_time: timestamp
    })
  }

  const counts = {}
  try {
    if (typeof deps.beforeDeleteHook === 'function') await deps.beforeDeleteHook(run)
    const userIds = pair.userIds
    const matchLogs = await collect(deps, 'user_match_log', [
      ...numericQueries('user_id', userIds),
      ...numericQueries('match_user_id', userIds)
    ])
    const matchLogIds = matchLogs.map((row) => Number(row.id)).filter((id) => id > 0)
    const pairKeys = [...new Set([pair.pairKey, ...matchLogs.map((row) => row.pair_key)].filter(Boolean))]
    const coordinations = await collect(deps, 'date_coordination', [
      ...numericQueries('user_a_id', userIds),
      ...numericQueries('user_b_id', userIds),
      ...numericQueries('match_log_id', matchLogIds),
      ...stringQueries('pair_key', pairKeys)
    ])
    const coordinationIds = coordinations.map((row) => Number(row.id)).filter((id) => id > 0)
    const dateSessions = (await collect(deps, 'agent_session', numericQueries('coordination_id', coordinationIds)))
      .filter((row) => String(row.agent_type || '') === 'date_coordinator')
    const sessionIds = dateSessions.map((row) => Number(row.id)).filter((id) => id > 0)

    const coordinationChildren = [
      'date_coordination_confirmation',
      'date_coordination_proposal',
      'date_coordination_application',
      'date_application_patch',
      'date_coordination_event',
      'date_coordination_event_dedupe',
      'coordination_projection_outbox',
      'date_participant',
      'date_experience_feedback',
      'fixture_response_job',
      'controlled_date_scenario_run',
      'coordination_notification',
      'coordination_notification_dedupe',
      'date_submission_outbox'
    ]
    for (const name of coordinationChildren) {
      await deleteByQueries(deps, name, numericQueries('coordination_id', coordinationIds), counts)
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
        ...numericQueries('session_id', sessionIds),
        ...numericQueries('coordination_id', coordinationIds)
      ], counts)
    }
    await deleteByQueries(deps, 'agent_session_dedupe', [
      ...numericQueries('session_id', sessionIds),
      ...numericQueries('coordination_id', coordinationIds)
    ], counts)
    await removeRows(deps, 'agent_session', dateSessions, counts)

    const meetReports = await collect(deps, 'meet_report', [
      ...numericQueries('match_log_id', matchLogIds),
      ...numericQueries('user_id', userIds),
      ...numericQueries('match_user_id', userIds)
    ])
    const meetReportIds = meetReports.map((row) => Number(row.id)).filter((id) => id > 0)
    await deleteByQueries(deps, 'meet_location_log', numericQueries('meet_report_id', meetReportIds), counts)
    await deleteByQueries(deps, 'sos_log', numericQueries('meet_report_id', meetReportIds), counts)
    await removeRows(deps, 'meet_report', meetReports, counts)

    const matchChildren = [
      'match_experience_feedback',
      'ai_report_task',
      'match_handoff_ticket'
    ]
    for (const name of matchChildren) {
      await deleteByQueries(deps, name, [
        ...numericQueries('match_log_id', matchLogIds),
        ...numericQueries('user_id', userIds)
      ], counts)
    }
    await deleteByQueries(deps, 'match_claim', stringQueries('pair_key', pairKeys), counts)
    await deleteByQueries(deps, 'match_claim_audit', stringQueries('pair_key', pairKeys), counts)
    await deleteByQueries(deps, 'match_batch_run', numericQueries('requester_user_id', userIds), counts)
    await removeRows(deps, 'date_coordination', coordinations, counts)
    await removeRows(deps, 'user_match_log', matchLogs, counts)

    for (const user of pair.users) await deps.updateByDoc('user', user, resetUserPatch(timestamp))
    const cursors = await collect(deps, 'user_notification_cursor', numericQueries('user_id', userIds))
    for (const cursor of cursors) {
      const remaining = await collect(deps, 'coordination_notification', [{ user_id: Number(cursor.user_id) }])
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
      error_code: String(error && (error.errorCode || error.code) || 'QA_PAIR_RESET_RETRYABLE'),
      update_time: deps.now()
    }).catch(() => null)
    throw error
  }
}

module.exports = {
  executeQaPairReset,
  getQaPairResetStatus,
  assertQaPairResetNotBlockingMatch,
  collect,
  listPage
}
