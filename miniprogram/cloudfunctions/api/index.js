const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const { handleRoute } = require('./handlers/route')
const { handleHttp } = require('./handlers/paymentNotify')
const { processQueuedTasks } = require('./handlers/reportTask')
const { processNotificationJobs } = require('./agent/notificationJobs')
const { processCoordinationDeadlines } = require('./handlers/dateCoordination')
const { processCoordinationTasks } = require('./handlers/dateCoordinationWorker')
const { processCoordinationProjectionOutbox } = require('./handlers/dateCoordinationProjectionWorker')
const { processFixtureResponseJobs } = require('./lib/fixtureResponseService')
const { isHttpEvent } = require('./lib/httpEvent')
const { runFormalMatchBatch } = require('./lib/matchingRunService')
const { executeFormalMatching } = require('./lib/formalMatching')
const { assertInternalWorkerSecret } = require('./lib/internalWorkerAuth')
const cloudbaseAi = require('./lib/cloudbaseAi')
const db = require('./lib/db')

const ENV_ID = 'cloud1-d4gy8l52g08bba326'

exports.main = async (event = {}) => {
  if (isHttpEvent(event)) {
    return handleHttp(event)
  }
  const action = event.action
  const payload = event.payload || {}
  try {
    switch (action) {
      case 'ping':
        return {
          success: true,
          data: {
            message: 'pong',
            env: ENV_ID
          }
        }
      case 'request':
        return {
          success: true,
          data: await handleRoute(payload, cloud.getWXContext())
        }
      case 'processReportTasks':
        assertInternalWorkerSecret(payload.worker_secret)
        return {
          success: true,
          data: await processQueuedTasks(Number(payload.limit || 2))
        }
      case 'processWorkerTasks': {
        assertInternalWorkerSecret(payload.worker_secret)
        const [reports, notifications, coordinationDeadlines, coordinationTasks, coordinationProjections, fixtureResponses] = await Promise.all([
          processQueuedTasks(Number(payload.report_limit || 2)),
          processNotificationJobs({ limit: Number(payload.notification_limit || 10) }),
          processCoordinationDeadlines({ limit: Number(payload.coordination_limit || 50) }),
          processCoordinationTasks({ limit: Number(payload.coordination_task_limit || 10) }),
          processCoordinationProjectionOutbox({ limit: Number(payload.coordination_projection_limit || 20) }),
          processFixtureResponseJobs({
            listDue: db.listDueFixtureResponseJobs,
            claimJob: db.claimFixtureResponseJob,
            completeJob: db.completeFixtureResponseJob,
            retryJob: db.retryFixtureResponseJob,
            now: db.now
          }, { limit: Number(payload.fixture_limit || 20) })
        ])
        return { success: true, data: { reports, notifications, coordinationDeadlines, coordinationTasks, coordinationProjections, fixtureResponses } }
      }
      case 'aiSmoke':
        assertInternalWorkerSecret(payload.worker_secret)
        return {
          success: true,
          data: await cloudbaseAi.smokeTest({ prompt: String(payload.prompt || '只回复：HY3_OK') })
        }
      case 'runFormalMatchBatch':
        assertInternalWorkerSecret(payload.worker_secret)
        if (payload.dry_run === true || payload.dryRun === true) {
          const { dryRunProductionCycle } = require('./lib/matchCycleService')
          return {
            success: true,
            data: dryRunProductionCycle(payload.simulated_now ? new Date(payload.simulated_now) : new Date())
          }
        }
        return {
          success: true,
          data: await runFormalMatchBatch({
            now: new Date(),
            requestId: payload.request_id,
            triggerSource: payload.trigger_source || 'timer'
          }, {
            acquireBatch: db.acquireFormalMatchBatch,
            updateByDoc: db.updateByDoc,
            list: db.list,
            byId: db.byId,
            now: db.now,
            executeMatching: (ctx) => executeFormalMatching(Object.assign({}, ctx, {
              deps: Object.assign({}, ctx.deps, {
                ensureReportTask: require('./handlers/reportTask').ensureTaskForMatch
              })
            }))
          })
        }
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`
        }
    }
  } catch (err) {
    const errorCode = (err && err.errorCode) || (err && typeof err.code === 'string' ? err.code : '')
    const httpCode = Number(err && err.httpCode || (err && typeof err.code === 'number' ? err.code : 500))
    return {
      success: false,
      code: errorCode || (err && err.code),
      errorCode,
      httpCode,
      error: (err && err.message) || 'server error'
    }
  }
}
