const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ACTION_BACKFILL = 'backfillRagCorpus'
const ACTION_SMOKE = 'smokeSparseRag'
const ACTION_FORMAL = 'runFormalMatchBatch'
const MAX_PAGE_COUNT = 10

function workerError(message) {
  const error = new Error(message)
  error.code = 'INVALID_WORKER_EVENT'
  return error
}

function validSecret(value) {
  const secret = String(value || '')
  if (secret.length < 24) throw workerError('MATCH_WORKER_SECRET 未配置')
  return secret
}

function pageLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(1, Math.min(MAX_PAGE_COUNT, Math.floor(number)))
}

function cursor(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function payloadOf(event) {
  if (event && event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) {
    return event.payload
  }
  return event && typeof event === 'object' ? event : {}
}

function requestId(event, timestamp) {
  const value = event && (event.requestId || event.RequestId)
  return String(value || `timer:${timestamp}`).slice(0, 120)
}

function boundedProfiles(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 10)
}

/**
 * Convert an EventBridge/timer payload into the exact API invocation contract.
 * This function is deliberately pure: no CloudBase calls, clocks, or secrets
 * are read from global state. Unknown explicit actions fail closed.
 */
function mapWorkerEvent(event = {}, configuredSecret, now = () => Date.now()) {
  const secret = validSecret(configuredSecret)
  const input = event && typeof event === 'object' ? event : {}
  const action = input.action
  const source = payloadOf(input)

  if (action === undefined || action === null || action === '' || action === ACTION_FORMAL) {
    const timestamp = typeof now === 'function' ? now() : now
    return {
      action: ACTION_FORMAL,
      payload: {
        request_id: requestId(input, timestamp),
        trigger_source: 'timer',
        worker_secret: secret
      }
    }
  }

  if (action === ACTION_BACKFILL) {
    return {
      action: ACTION_BACKFILL,
      payload: {
        dry_run: source.dry_run === true || source.dryRun === true,
        cursor: cursor(source.cursor !== undefined ? source.cursor : (source.after_id !== undefined ? source.after_id : source.afterId)),
        page_limit: pageLimit(source.page_limit !== undefined ? source.page_limit : (source.pageLimit !== undefined ? source.pageLimit : source.maxPages)),
        worker_secret: secret
      }
    }
  }

  if (action === ACTION_SMOKE) {
    const payload = {
      fixture_only: source.fixture_only === true || source.fixtureOnly === true,
      profiles: boundedProfiles(source.profiles || source.fixture_profiles || source.fixtureProfiles),
      worker_secret: secret
    }
    const requestedMode = source.rag_mode || source.ragMode
    if (requestedMode !== undefined) payload.rag_mode = String(requestedMode).slice(0, 16)
    return { action: ACTION_SMOKE, payload }
  }

  throw workerError('未知 worker action')
}

exports.main = async (event = {}) => {
  const workerSecret = String(process.env.MATCH_WORKER_SECRET || '')
  validSecret(workerSecret)
  const data = mapWorkerEvent(event, workerSecret)
  const result = await cloud.callFunction({
    name: 'api',
    data
  })
  return result.result
}

module.exports.mapWorkerEvent = mapWorkerEvent
module.exports.ACTIONS = Object.freeze({ backfill: ACTION_BACKFILL, smoke: ACTION_SMOKE, formal: ACTION_FORMAL })
