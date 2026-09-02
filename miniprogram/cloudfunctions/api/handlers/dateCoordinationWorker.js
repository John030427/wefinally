const { computeOverlap } = require('../lib/dateCoordinationPolicy')
const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')
const { buildStructuredCounterProposal } = require('../lib/dateCounterOfferPolicy')

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
  const tasks = await deps.listTasks(current, limit)
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
      const byUser = new Map((applications || []).map((item) => [Number(item.user_id), item]))
      const applicationRowA = byUser.get(Number(lease.user_a_id))
      const applicationRowB = byUser.get(Number(lease.user_b_id))
      const applicationA = applicationRowA && applicationRowA.application
      const applicationB = applicationRowB && applicationRowB.application
      if (!applicationA || !applicationB) throw new Error('双方协调申请不完整')
      const overlap = computeOverlap(applicationA, applicationB, { version })
      const result = await deps.completeTask(lease, overlap, current)
      if (result && result.applied) {
        completed += 1
        const proposals = result.proposals || []
        const changedByUserId = Number(result.coordination.last_changed_by_user_id || 0)
        const counterViewerId = changedByUserId === Number(result.coordination.user_a_id)
          ? Number(result.coordination.user_b_id)
          : (changedByUserId === Number(result.coordination.user_b_id) ? Number(result.coordination.user_a_id) : 0)
        const counterOffer = !proposals.length && counterViewerId
          ? buildStructuredCounterProposal({
            coordination: result.coordination,
            applicationA,
            applicationB,
            applicationRowA,
            applicationRowB,
            invitationPrimary: result.coordination.invitation_primary_proposal,
            viewerUserId: counterViewerId
          })
          : null
        try {
          await deps.publishCoordinationEvent({
            coordination: result.coordination,
            event: {
              event_type: proposals.length ? 'proposal_generated' : 'no_overlap',
              actor_user_id: counterOffer ? changedByUserId : 0,
              coordination_version: version,
              proposal: proposals[0] || null,
              counter_offer: counterOffer
            }
          })
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
          } else if (counterOffer && typeof deps.writeInboxNotification === 'function') {
            try {
              await deps.writeInboxNotification({
                coordination: result.coordination,
                user_id: counterViewerId,
                event_type: 'counter_offer_ready',
                coordination_version: version,
                title: '对方调整了约会方案',
                body: '请打开协调页核对改动项和调整后的完整方案，再决定接受或继续调整。',
                stage: 'review_counter_proposal',
                changed_dimensions: counterOffer.changed_dimensions || []
              })
            } catch (inboxError) {
              console.warn('inbox counter-offer notification skipped:', inboxError.message || inboxError)
            }
          }
        } catch (eventError) {
          if (deps.onEventError) await deps.onEventError(eventError, result.coordination)
        }
      } else stale += 1
    } catch (error) {
      const failedTask = await deps.failTask(lease, errorCode(error), current)
      if (failedTask && failedTask.processing_status === 'failed') {
        await deps.publishCoordinationEvent({
          coordination: failedTask,
          event: {
            event_type: 'processing_failed',
            coordination_version: Number(failedTask.coordination_version || lease.coordination_version || 1)
          }
        })
      }
      failed += 1
    }
  }
  return { scanned: (tasks || []).length, claimed, completed, stale, failed }
}

module.exports = { processCoordinationTasks, errorCode }
