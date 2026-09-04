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
const deepseek = require('./lib/deepseek')
const { resolveRagMode } = require('./lib/matchRagRuntime')
const { rankCandidates } = require('./lib/matchPolicy')
const { canUseFixtureForMatch } = require('./lib/testFixturePolicy')
const cloudbaseAi = require('./lib/cloudbaseAi')
const db = require('./lib/db')
const { SAFE_PUBLIC_ERROR_CODES, declaredPublicCode } = require('./lib/publicErrorCodes')

const ENV_ID = 'cloud1-d4gy8l52g08bba326'
const MAX_RAG_BACKFILL_PAGES = 10
const MAX_SMOKE_PROFILES = 10
const MAX_SMOKE_REF_OUTPUT = 50
const SAFE_EVIDENCE_KEY = /^[a-z][a-z0-9_]*:[a-f0-9]{16,64}$/i
const SAFE_SEMANTIC_REF = /^candidate_[1-9]\d{0,2}$/
const SAFE_SMOKE_KEY = /(?:sanitized[_ -]?text|evidence[_ -]?text|prompt|response|openid|unionid|phone|mobile|wechat|secret|token|password|credential|api[_ -]?key|raw[_ -]?text|original[_ -]?text)/i
const SAFE_SMOKE_VALUE = /(?:1[3-9]\d{9}|(?:openid|unionid|session[_ -]?key|token)\s*[:=]|手机号|手机号码|微信号|联系方式|原始文本|raw\s+text|密码|密钥)/i
const SAFE_SMOKE_REASONS = new Set([
  '',
  'no_candidates',
  'disabled',
  'timeout',
  'rate_limited',
  'provider_auth',
  'invalid_result',
  'semantic_retrieval_unavailable',
  'sparse_retrieval_insufficient',
  'corpus_unavailable',
  'corpus_invalid',
  'provider_config_invalid',
  'provider_error',
  'fallback_deterministic',
  'low_confidence'
])
const SMOKE_PROFILE_FIELDS = [
  'id',
  'gender',
  'birth_year',
  'city',
  'city_name',
  'province_code',
  'province_name',
  'baby_plan',
  'height_range',
  'education',
  'identity_circle_ids',
  'circle_id',
  'appearance_description',
  'appearance_want',
  'appearance_tags',
  'appearance_want_tags',
  'marry_status',
  'marriage_status',
  'smoking_status',
  'smoking',
  'match_status',
  'matched_partner_id'
]
const SMOKE_SETTING_FIELDS = [
  'user_id',
  'self_view_text',
  'target_view_text',
  'psych_profile_json',
  'other_requirements',
  'deal_breakers',
  'appearance_want',
  'like_baby_plan',
  'age_min',
  'age_max',
  'height_min',
  'height_max',
  'min_education',
  'like_circle_ids',
  'must_marry_status',
  'required_marry_status',
  'must_baby_plan',
  'required_baby_plan',
  'must_city',
  'required_city',
  'must_smoking_status',
  'required_smoking_status',
  'must_height_min',
  'must_height_max',
  'require_safe_account'
]

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key))
}

function boundedPageLimit(value) {
  if (value === undefined) return 1
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    const error = new Error('INVALID_RAG_BACKFILL_REQUEST')
    error.code = 400
    error.publicCode = 'INVALID_RAG_BACKFILL_REQUEST'
    throw error
  }
  return Math.max(1, Math.min(MAX_RAG_BACKFILL_PAGES, value))
}

function boundedCursor(value) {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    const error = new Error('INVALID_RAG_BACKFILL_REQUEST')
    error.code = 400
    error.publicCode = 'INVALID_RAG_BACKFILL_REQUEST'
    throw error
  }
  return value
}

function normalizedBackfillPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !hasOwn(payload, 'dry_run') || typeof payload.dry_run !== 'boolean') {
    const error = new Error('INVALID_RAG_BACKFILL_REQUEST')
    error.code = 400
    error.publicCode = 'INVALID_RAG_BACKFILL_REQUEST'
    throw error
  }
  return {
    dry_run: payload.dry_run,
    cursor: boundedCursor(payload.cursor),
    page_limit: boundedPageLimit(payload.page_limit)
  }
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

function smokeError(message, publicCode = 'INVALID_RAG_SMOKE_REQUEST') {
  const error = new Error(message)
  error.code = 400
  error.publicCode = publicCode
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
  const explicitlyNonFixture = item && (item.fixture_only === false
    || item.fixtureOnly === false
    || (item.profile_origin !== undefined && item.profile_origin !== 'synthetic_fixture'))
  if (!item || typeof item !== 'object' || Array.isArray(item)
    || (!fixtureMarked && !fixtureEnvelope)
    || explicitlyNonFixture
    || item.sanitized !== true) {
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
  const sourceOrigin = source.profile_origin
  if (sourceOrigin !== undefined && sourceOrigin !== 'synthetic_fixture') {
    throw smokeError('smoke 仅接受 fixture profile，不接受真实用户画像')
  }
  const fixtureExpiresAt = item.fixture_expires_at || source.fixture_expires_at || null
  if (fixtureExpiresAt !== null
    && (typeof fixtureExpiresAt !== 'string' || !Number.isFinite(new Date(fixtureExpiresAt).getTime()))) {
    throw smokeError('smoke fixture 有效期无效')
  }
  const fixture = Object.assign({}, user, {
    profile_origin: 'synthetic_fixture',
    is_test_fixture: 1,
    fixture_access_mode: 'public_test_pool',
    fixture_expires_at: fixtureExpiresAt
  })
  return { id, user, settings, fixture }
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

function candidateRefForSmoke(index) {
  return `candidate_${Number(index) + 1}`
}

function normalizedSemanticRef(value) {
  if (typeof value !== 'string') return ''
  return SAFE_SEMANTIC_REF.test(value) ? value : ''
}

function projectSemanticRefs(refs) {
  const source = Array.isArray(refs) ? refs : []
  return source.slice(0, MAX_SMOKE_REF_OUTPUT).map((value) => normalizedSemanticRef(value) || 'invalid_ref')
}

function sameCandidateRefSequence(rawRefs, deterministicRefs) {
  if (!Array.isArray(rawRefs) || !Array.isArray(deterministicRefs)
    || rawRefs.length !== deterministicRefs.length) return false
  return rawRefs.every((ref, index) => (
    typeof ref === 'string'
      && SAFE_SEMANTIC_REF.test(ref)
      && ref === deterministicRefs[index]
  ))
}

function boundedPublicErrorCode(err, action, numericCode) {
  const declared = String(err && err.publicCode || '')
  if (SAFE_PUBLIC_ERROR_CODES.has(declared)) return declared
  if (numericCode === 403) return 'WORKER_AUTH_FAILED'
  if (action === 'backfillRagCorpus') return 'RAG_BACKFILL_FAILED'
  if (action === 'smokeSparseRag') return 'RAG_SMOKE_FAILED'
  return 'SERVER_ERROR'
}

function safeSmokeReason(value) {
  const reason = String(value || '').trim()
  if (reason === 'invalid_response') return 'invalid_result'
  return SAFE_SMOKE_REASONS.has(reason) ? reason : 'fallback_deterministic'
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

  const fixtureNow = new Date()
  const fixtureViewer = profiles[0].fixture
  profiles.forEach((profile) => {
    if (!canUseFixtureForMatch(fixtureViewer, profile.fixture, fixtureNow)) {
      throw smokeError('smoke fixture 当前不可用于匹配')
    }
  })

  const corpus = {}
  const settingsByUserId = {}
  profiles.forEach((item) => {
    corpus[String(item.id)] = projectCorpusDocuments(item.user, item.settings, fixtureNow)
    settingsByUserId[String(item.id)] = item.settings
  })
  const viewer = profiles[0]
  const candidates = profiles.slice(1)
  const ranked = rankCandidates(viewer.user, candidates.map((candidate) => candidate.user), settingsByUserId)
  const deterministicEligible = ranked
    .filter((item) => item && item.quality && item.quality.pass === true)
  const deterministicCandidateRefs = deterministicEligible
    .map((item, index) => candidateRefForSmoke(index))
  const eligibleById = new Map(ranked
    .filter((item) => item && item.quality && item.quality.pass === true)
    .map((item) => [String(item.candidate.id), item.candidate]))
  const retrievals = await Promise.all([...eligibleById.values()].map((candidate) => {
    const candidateProfile = profiles.find((profile) => String(profile.id) === String(candidate.id))
    return retrieveSparseBidirectional({
      userA: viewer.user,
      settingsA: viewer.settings,
      userB: candidate,
      settingsB: candidateProfile ? candidateProfile.settings : {}
    }, corpus)
  }))
  const requestedMode = payload.rag_mode || payload.ragMode || process.env.MATCH_RAG_MODE
  const mode = resolveRagMode({ MATCH_RAG_MODE: requestedMode })
  let rawSemanticRefs = null
  const semanticOptions = {
    ragMode: mode,
    loadCorpus: async () => corpus
  }
  if (mode !== 'off') {
    semanticOptions.rerank = async (request) => {
      const remote = await deepseek.rerankMutualMatchCandidates(request)
      if (remote && remote.response !== null && remote.response !== undefined) {
        const ranking = remote.response && Array.isArray(remote.response.ranking)
          ? remote.response.ranking
          : []
        rawSemanticRefs = ranking.map((item) => (
          item && typeof item === 'object' && hasOwn(item, 'candidate_ref')
            ? item.candidate_ref
            : null
        ))
      }
      return remote
    }
  }
  const result = await semanticRerank(ranked, viewer.user, settingsByUserId, semanticOptions)
  const rankedResult = result && Array.isArray(result.ranked) ? result.ranked : []
  const firstRanked = rankedResult.find((item) => item && item.quality && item.quality.pass === true)
    || rankedResult[0]
  const retrieval = firstRanked && firstRanked.retrieval
  const effectiveRetrievals = retrieval ? [retrieval] : retrievals
  const firstRetrieval = effectiveRetrievals[0] || {}
  const metadata = result && result.rag && typeof result.rag === 'object' ? result.rag : {}
  const reason = String(metadata.reason || firstRetrieval.reason || '').trim()
  const semanticOutputRefs = rawSemanticRefs === null ? deterministicCandidateRefs : rawSemanticRefs
  const outputCandidateRefs = projectSemanticRefs(semanticOutputRefs)
  const candidateSetInvariant = rawSemanticRefs === null
    ? true
    : sameCandidateRefSequence(rawSemanticRefs, deterministicCandidateRefs)
  return {
    rag_mode: mode,
    retrieval_version: RETRIEVAL_VERSION,
    corpus_version: CHUNK_VERSION,
    provider: mode === 'off' ? '' : String(metadata.provider || '').slice(0, 40),
    model: mode === 'off' ? '' : String(metadata.model || '').slice(0, 80),
    reason: candidateSetInvariant ? safeSmokeReason(reason) : 'invalid_result',
    score: Object.assign({}, retrievalScoreForSmoke(effectiveRetrievals), {
      final: scoreForSmoke(firstRanked && firstRanked.canonical_score)
    }),
    evidence_keys: evidenceKeysForSmoke(effectiveRetrievals),
    input_candidate_refs: deterministicCandidateRefs,
    output_candidate_refs: outputCandidateRefs,
    candidate_set_invariant: candidateSetInvariant,
    output_candidate_ref_count: semanticOutputRefs.length,
    output_invalid_candidate_ref_count: semanticOutputRefs
      .filter((value) => !normalizedSemanticRef(value)).length,
    output_candidate_refs_truncated: semanticOutputRefs.length > MAX_SMOKE_REF_OUTPUT
  }
}

exports.main = async (event = {}) => {
  if (isHttpEvent(event)) {
    return handleHttp(event)
  }
  let action
  let payload = {}
  try {
    action = event && typeof event === 'object' ? event.action : undefined
    payload = event && typeof event === 'object' ? (event.payload || {}) : {}
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
        const backfillPayload = normalizedBackfillPayload(payload)
        return {
          success: true,
          data: await backfillCorpus(backfillPayload, ragBackfillRepository())
        }
      }
      case 'smokeSparseRag':
        assertInternalWorkerSecret(payload.worker_secret)
        return { success: true, data: await smokeSparseRag(payload) }
      default:
        return {
          success: false,
          code: 400,
          error: 'UNKNOWN_ACTION'
        }
    }
  } catch (err) {
    const publicCode = declaredPublicCode(err)
    if (publicCode) {
      const publicMessage = String(err.publicMessage || err.message || publicCode).slice(0, 40)
      const numericCode = Number(err && err.code)
      const payload = {
        success: false,
        code: numericCode === 403 ? 403 : (numericCode === 400 ? 400 : 500),
        error: publicCode,
        message: publicMessage
      }
      if (err && err.recovery) payload.recovery = String(err.recovery)
      return payload
    }
    const numericCode = Number(err && err.code)
    const code = numericCode === 403 ? 403 : (numericCode === 400 ? 400 : 500)
    const error = boundedPublicErrorCode(err, action, code)
    return {
      success: false,
      code,
      error,
      message: error
    }
  }
}
