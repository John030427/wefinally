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
const { processFixtureResponseJobs } = require('./lib/fixtureResponseService')
const { isHttpEvent } = require('./lib/httpEvent')
const { runFormalMatchBatch } = require('./lib/matchingRunService')
const { executeFormalMatching } = require('./lib/formalMatching')
const { assertInternalWorkerSecret } = require('./lib/internalWorkerAuth')
const {
  backfillCorpus,
  projectCorpusDocuments,
  CHUNK_VERSION,
  RETRIEVAL_VERSION
} = require('./lib/matchRagCorpus')
const { retrieveSparseBidirectional } = require('./lib/sparseMatchRetrieval')
const { semanticRerank } = require('./lib/semanticMatchService')
const { resolveRagMode } = require('./lib/matchRagRuntime')
const cloudbaseAi = require('./lib/cloudbaseAi')
const db = require('./lib/db')

const ENV_ID = 'cloud1-d4gy8l52g08bba326'
const MAX_RAG_BACKFILL_PAGES = 10
const MAX_SMOKE_PROFILES = 10
const SAFE_EVIDENCE_KEY = /^[a-z][a-z0-9_]*:[a-f0-9]{16,64}$/i
const SAFE_SMOKE_KEY = /(?:sanitized[_ -]?text|evidence[_ -]?text|prompt|response|openid|unionid|phone|mobile|wechat|secret|token|password|raw[_ -]?text|original[_ -]?text)/i
const SAFE_SMOKE_VALUE = /(?:1[3-9]\d{9}|(?:openid|unionid|session[_ -]?key|token)\s*[:=]|手机号|手机号码|微信号|联系方式|原始文本|raw\s+text)/i
const SMOKE_PROFILE_FIELDS = [
  'id',
  'gender',
  'birth_year',
  'city',
  'baby_plan',
  'appearance_description',
  'appearance_want'
]
const SMOKE_SETTING_FIELDS = [
  'user_id',
  'self_view_text',
  'target_view_text',
  'psych_profile_json',
  'other_requirements',
  'deal_breakers',
  'appearance_want',
  'like_baby_plan'
]

function boundedPageLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(1, Math.min(MAX_RAG_BACKFILL_PAGES, Math.floor(number)))
}

function boundedCursor(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function ragBackfillRepository() {
  return {
    listUsersPage: db.listUsersPage,
    findSetting: db.findSetting,
    listChunksByOwnerIds: db.listChunksByOwnerIds,
    upsertChunk: db.upsertChunk,
    disableChunks: db.disableChunks,
    now: db.now
  }
}

function smokeError(message) {
  const error = new Error(message)
  error.code = 400
  return error
}

function assertSafeSmokeInput(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    if (SAFE_SMOKE_VALUE.test(value)) throw smokeError('smoke 画像包含不允许的身份或原始文本')
    return
  }
  if (typeof value !== 'object') return
  if (seen.has(value)) throw smokeError('smoke 画像结构无效')
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeSmokeInput(item, seen))
    return
  }
  Object.keys(value).forEach((key) => {
    if (SAFE_SMOKE_KEY.test(key)) throw smokeError('smoke 画像包含不允许的字段')
    assertSafeSmokeInput(value[key], seen)
  })
}

function copySmokeFields(input, fields) {
  const source = input && typeof input === 'object' ? input : {}
  const output = {}
  fields.forEach((field) => {
    if (source[field] !== undefined && source[field] !== null) output[field] = source[field]
  })
  return output
}

function validSmokeId(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!/^[1-9]\d*$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function normalizeSmokeProfile(item, fixtureEnvelope = false) {
  const fixtureMarked = item && (item.fixture_only === true
    || item.fixtureOnly === true
    || item.profile_origin === 'synthetic_fixture'
    || Number(item.is_test_fixture || 0) === 1)
  if (!item || typeof item !== 'object' || Array.isArray(item)
    || (!fixtureMarked && !fixtureEnvelope)
    || item.sanitized === false) {
    throw smokeError('smoke 仅接受明确标记的 fixture-only sanitized profiles')
  }
  assertSafeSmokeInput(item)
  const source = item.profile || item.user || item.sanitized_profile || item
  const rawSettings = item.settings || item.match_setting || item.matchSetting || {}
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || !rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw smokeError('smoke profile 结构无效')
  }
  const id = validSmokeId(item.id !== undefined ? item.id : source.id)
  if (id === null || (source.id !== undefined && validSmokeId(source.id) !== id)) {
    throw smokeError('smoke profile id 无效')
  }
  const user = copySmokeFields(source, SMOKE_PROFILE_FIELDS)
  user.id = id
  const settings = copySmokeFields(rawSettings, SMOKE_SETTING_FIELDS)
  settings.user_id = id
  return { id, user, settings }
}

function scoreForSmoke(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0
}

function evidenceKeysForSmoke(retrievals) {
  const keys = []
  ;(retrievals || []).forEach((retrieval) => {
    ;[retrieval && retrieval.a_to_b, retrieval && retrieval.b_to_a].forEach((side) => {
      ;(side && side.top_evidence || []).forEach((hit) => {
        ;[hit && hit.evidence_key, hit && hit.query_evidence_key].forEach((value) => {
          const key = String(value || '').trim()
          if (SAFE_EVIDENCE_KEY.test(key)) keys.push(key)
        })
      })
    })
  })
  return [...new Set(keys)].sort().slice(0, 24)
}

function retrievalScoreForSmoke(retrievals) {
  const first = retrievals && retrievals[0]
  const aToB = first && first.a_to_b
  const bToA = first && first.b_to_a
  return {
    a_to_b: scoreForSmoke(aToB && aToB.score),
    b_to_a: scoreForSmoke(bToA && bToA.score),
    mutual: scoreForSmoke(first && first.mutual_score)
  }
}

async function smokeSparseRag(input = {}) {
  const payload = input && typeof input === 'object' ? input : {}
  const fixtureEnvelope = payload.fixture_only === true || payload.fixtureOnly === true
  if (!fixtureEnvelope || !Array.isArray(payload.profiles)
    || payload.profiles.length < 2 || payload.profiles.length > MAX_SMOKE_PROFILES) {
    throw smokeError('smoke 仅接受 2-10 个 fixture-only sanitized profiles')
  }
  const profiles = payload.profiles.map((item) => normalizeSmokeProfile(item, fixtureEnvelope))
  const uniqueIds = new Set(profiles.map((item) => String(item.id)))
  if (uniqueIds.size !== profiles.length) throw smokeError('smoke profile id 必须唯一')

  const corpus = {}
  const settingsByUserId = {}
  profiles.forEach((item) => {
    corpus[String(item.id)] = projectCorpusDocuments(item.user, item.settings, '2026-09-01T00:00:00.000Z')
    settingsByUserId[String(item.id)] = item.settings
  })
  const viewer = profiles[0]
  const candidates = profiles.slice(1)
  const retrievals = await Promise.all(candidates.map((candidate) => retrieveSparseBidirectional({
    userA: viewer.user,
    settingsA: viewer.settings,
    userB: candidate.user,
    settingsB: candidate.settings
  }, corpus)))
  const ranked = candidates.map((candidate) => ({
    candidate: candidate.user,
    quality: { pass: true, reasons: [] },
    mutualScore: 0,
    viewSimilarity: 0,
    scoreA: { normalizedTotal: 0, completeness: 0 },
    scoreB: { normalizedTotal: 0, completeness: 0 }
  }))
  const requestedMode = payload.rag_mode || payload.ragMode || process.env.MATCH_RAG_MODE
  const mode = resolveRagMode({ MATCH_RAG_MODE: requestedMode })
  const result = await semanticRerank(ranked, viewer.user, settingsByUserId, {
    ragMode: mode,
    loadCorpus: async () => corpus
  })
  const firstRanked = result && result.ranked && result.ranked[0]
  const retrieval = firstRanked && firstRanked.retrieval
  const effectiveRetrievals = retrieval ? [retrieval] : retrievals
  const firstRetrieval = effectiveRetrievals[0] || {}
  const metadata = result && result.rag && typeof result.rag === 'object' ? result.rag : {}
  const reason = String(metadata.reason || firstRetrieval.reason || '').trim()
  return {
    rag_mode: mode,
    retrieval_version: RETRIEVAL_VERSION,
    corpus_version: CHUNK_VERSION,
    provider: mode === 'off' ? '' : String(metadata.provider || '').slice(0, 40),
    model: mode === 'off' ? '' : String(metadata.model || '').slice(0, 80),
    reason: /^[a-z0-9_]*$/.test(reason) ? reason : 'fallback_deterministic',
    score: Object.assign({}, retrievalScoreForSmoke(effectiveRetrievals), {
      final: scoreForSmoke(firstRanked && firstRanked.canonical_score)
    }),
    evidence_keys: evidenceKeysForSmoke(effectiveRetrievals)
  }
}

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
        const [reports, notifications, coordinationDeadlines, coordinationTasks, fixtureResponses] = await Promise.all([
          processQueuedTasks(Number(payload.report_limit || 2)),
          processNotificationJobs({ limit: Number(payload.notification_limit || 10) }),
          processCoordinationDeadlines({ limit: Number(payload.coordination_limit || 50) }),
          processCoordinationTasks({ limit: Number(payload.coordination_task_limit || 10) }),
          processFixtureResponseJobs({
            listDue: db.listDueFixtureResponseJobs,
            claimJob: db.claimFixtureResponseJob,
            completeJob: db.completeFixtureResponseJob,
            retryJob: db.retryFixtureResponseJob,
            now: db.now
          }, { limit: Number(payload.fixture_limit || 20) })
        ])
        return { success: true, data: { reports, notifications, coordinationDeadlines, coordinationTasks, fixtureResponses } }
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
      case 'backfillRagCorpus': {
        assertInternalWorkerSecret(payload.worker_secret)
        return {
          success: true,
          data: await backfillCorpus({
            dry_run: payload.dry_run === true || payload.dryRun === true,
            cursor: boundedCursor(payload.cursor !== undefined ? payload.cursor : (payload.after_id !== undefined ? payload.after_id : payload.afterId)),
            page_limit: boundedPageLimit(payload.page_limit !== undefined ? payload.page_limit : (payload.pageLimit !== undefined ? payload.pageLimit : payload.maxPages))
          }, ragBackfillRepository())
        }
      }
      case 'smokeSparseRag':
        assertInternalWorkerSecret(payload.worker_secret)
        return { success: true, data: await smokeSparseRag(payload) }
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
