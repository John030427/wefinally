const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const { handleRoute } = require('./handlers/route')
const { handleHttp } = require('./handlers/paymentNotify')
const { processQueuedTasks } = require('./handlers/reportTask')
const { processNotificationJobs } = require('./agent/notificationJobs')
const { processCoordinationDeadlines } = require('./handlers/dateCoordination')
const { processFixtureResponseJobs } = require('./lib/fixtureResponseService')
const { isHttpEvent } = require('./lib/httpEvent')
const { runFormalMatchBatch } = require('./lib/matchingRunService')
const { executeFormalMatching } = require('./lib/formalMatching')
const { assertInternalWorkerSecret } = require('./lib/internalWorkerAuth')
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
        return {
          success: true,
          data: await processQueuedTasks(Number(payload.limit || 2))
        }
      case 'processWorkerTasks': {
        const [reports, notifications, coordinations, fixtureResponses] = await Promise.all([
          processQueuedTasks(Number(payload.report_limit || 2)),
          processNotificationJobs({ limit: Number(payload.notification_limit || 10) }),
          processCoordinationDeadlines({ limit: Number(payload.coordination_limit || 50) }),
          processFixtureResponseJobs({
            first: db.first,
            list: db.list,
            addWithId: db.addWithId,
            updateByDoc: db.updateByDoc,
            claimIfStatus: db.claimIfStatus,
            now: db.now
          }, { limit: Number(payload.fixture_limit || 20) })
        ])
        return { success: true, data: { reports, notifications, coordinations, fixtureResponses } }
      }
      case 'runFormalMatchBatch':
        assertInternalWorkerSecret(payload.worker_secret)
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
            executeMatching: executeFormalMatching
          })
        }
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`
        }
    }
  } catch (err) {
    return {
      success: false,
      code: err && err.code,
      error: (err && err.message) || 'server error'
    }
  }
}
