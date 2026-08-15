const { computeOverlap } = require('../lib/dateCoordinationPolicy')

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
    now: db.now
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
      const byUser = new Map((applications || []).map((item) => [Number(item.user_id), item.application]))
      const applicationA = byUser.get(Number(lease.user_a_id))
      const applicationB = byUser.get(Number(lease.user_b_id))
      if (!applicationA || !applicationB) throw new Error('双方协调申请不完整')
      const overlap = computeOverlap(applicationA, applicationB, { version })
      const result = await deps.completeTask(lease, overlap, current)
      if (result && result.applied) completed += 1
      else stale += 1
    } catch (error) {
      await deps.failTask(lease, errorCode(error), current)
      failed += 1
    }
  }
  return { scanned: (tasks || []).length, claimed, completed, stale, failed }
}

module.exports = { processCoordinationTasks, errorCode }
