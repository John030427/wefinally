const { computeOverlap } = require('../lib/dateCoordinationPolicy')
const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    listTasks: db.listCoordinationProcessingTasks,
    claimTask: db.claimCoordinationProcessing,
    listApplications: (coordinationId, version) => db.list('date_coordination_application', {
      coordination_id: Number(coordinationId),
      coordination_version: Number(version)
    }, 10),
    completeTask: db.completeCoordinationProcessing,
    failTask: db.failCoordinationProcessing,
    publishCoordinationEvent,
    enqueueProjectionRetry: async (operation, coordination, payload, error) => {
      try {
        const eventType = String(payload && payload.event_type || operation)
        const actor = Number(payload && (payload.actor_user_id || payload.user_id) || 0)
        const version = Number(payload && (payload.coordination_version || payload.event_coordination_version)
          || coordination && coordination.coordination_version || 1)
        const idempotencyKey = `coordination:${Number(coordination && coordination.id || 0)}:v${version}:${operation}:${eventType}:${actor}`
        const existing = await db.first('coordination_projection_outbox', { idempotency_key: idempotencyKey }).catch(() => null)
        if (existing) return existing
        return await db.addWithId('coordination_projection_outbox', {
          idempotency_key: idempotencyKey,
          operation,
          coordination_id: Number(coordination && coordination.id || 0),
          coordination_version: version,
          projection_kind: 'coordination_processing_event',
          payload,
          status: 'pending',
          attempts: 0,
          last_error_code: String(error && (error.code || error.message) || 'projection_failed').slice(0, 120),
          create_time: db.now()
        }, 'coordination_projection_outbox')
      } catch (outboxError) {
        console.warn('coordination processing projection outbox skipped:', outboxError.message || outboxError)
        return null
      }
    },
    now: db.now,
    writeInboxNotification(input) {
      const { notifyInbox } = require('../lib/coordinationInbox')
      return notifyInbox(input)
    }
  }
}

function errorCode(error) {
  const message = String(error && error.message || '')
  if (/申请/.test(message)) return 'coordination_applications_missing'
  return 'coordination_processing_failed'
}

async function processCoordinationTasks(options = {}) {
  const deps = options.deps || defaultDeps()
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 50))
  const current = options.now || deps.now()
  const coordinationId = Number(options.coordinationId || options.coordination_id || 0)
  const listedTasks = await deps.listTasks(current, coordinationId ? 50 : limit)
  const tasks = coordinationId
    ? (listedTasks || []).filter((task) => Number(task.id) === coordinationId).slice(0, limit)
    : listedTasks
  let claimed = 0
  let completed = 0
  let stale = 0
  let failed = 0
  for (const task of tasks || []) {
    const lease = await deps.claimTask(task, current)
    if (!lease) continue
    claimed += 1
    try {
      const version = Number(lease.processing_version || lease.coordination_version || 0)
      const applications = await deps.listApplications(lease.id, version)
      const byUser = new Map((applications || []).map((item) => [Number(item.user_id), item.application]))
      const applicationA = byUser.get(Number(lease.user_a_id))
      const applicationB = byUser.get(Number(lease.user_b_id))
      if (!applicationA || !applicationB) throw new Error('双方协调申请不完整')
      const overlap = computeOverlap(applicationA, applicationB, { version })
      const result = await deps.completeTask(lease, overlap, current)
      if (result && result.applied) {
        completed += 1
        const proposals = result.proposals || []
        try {
          const projectionEvent = {
            event_type: proposals.length ? 'proposal_generated' : 'no_overlap',
            coordination_version: version,
            proposal: proposals[0] || null
          }
          await deps.publishCoordinationEvent({ coordination: result.coordination, event: projectionEvent })
          if (proposals.length && typeof deps.writeInboxNotification === 'function') {
            const participants = [Number(result.coordination.user_a_id), Number(result.coordination.user_b_id)].filter((id) => id > 0)
            for (const userId of participants) {
              try {
                await deps.writeInboxNotification({
                  coordination: result.coordination,
                  user_id: userId,
                  event_type: 'proposal_generated',
                  coordination_version: version,
                  title: '新的候选方案待确认',
                  body: '系统找到了一个双方都可接受的候选方案，请打开约会协调页查看并确认。',
                  stage: 'proposal_generated'
                })
              } catch (inboxError) {
                console.warn('inbox proposal notification skipped:', inboxError.message || inboxError)
              }
            }
          }
        } catch (eventError) {
          if (typeof deps.enqueueProjectionRetry === 'function') {
            await deps.enqueueProjectionRetry('publish_coordination_event', result.coordination, {
              event_type: proposals.length ? 'proposal_generated' : 'no_overlap',
              coordination_version: version,
              proposal: proposals[0] || null
            }, eventError)
          }
          if (deps.onEventError) await deps.onEventError(eventError, result.coordination)
        }
      } else stale += 1
    } catch (error) {
      const failedTask = await deps.failTask(lease, errorCode(error), current)
      if (failedTask && failedTask.processing_status === 'failed') {
        const failureEvent = {
          event_type: 'processing_failed',
          coordination_version: Number(failedTask.coordination_version || lease.coordination_version || 1)
        }
        try {
          await deps.publishCoordinationEvent({ coordination: failedTask, event: failureEvent })
        } catch (eventError) {
          if (typeof deps.enqueueProjectionRetry === 'function') {
            await deps.enqueueProjectionRetry('publish_coordination_event', failedTask, failureEvent, eventError)
          }
        }
      }
      failed += 1
    }
  }
  return { scanned: (tasks || []).length, claimed, completed, stale, failed }
}

module.exports = { processCoordinationTasks, errorCode }
