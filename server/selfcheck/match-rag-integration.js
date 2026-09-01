const assert = require('assert')

const deepseek = require('../../miniprogram/cloudfunctions/api/lib/deepseek')
const { semanticRerank } = require('../../miniprogram/cloudfunctions/api/lib/semanticMatchService')
const { RERANK_VERSION } = require('../../miniprogram/cloudfunctions/api/lib/matchSemanticRerank')
const { projectCorpusDocuments, CHUNK_VERSION } = require('../../miniprogram/cloudfunctions/api/lib/matchRagCorpus')
const { RETRIEVAL_VERSION } = require('../../miniprogram/cloudfunctions/api/lib/sparseMatchRetrieval')

const psych = JSON.stringify({
  marriage_pace: '稳定推进',
  conflict_style: '及时沟通',
  security_space: '亲密也独立',
  family_boundary: '边界清晰',
  money_view: '共同规划',
  career_family: '工作生活平衡'
})

function user(id, overrides = {}) {
  return Object.assign({
    id,
    gender: id === 1 ? 1 : 2,
    birth_year: id === 199 ? 1990 : 1992,
    city: '深圳',
    baby_plan: '3-5年内',
    appearance_description: '干净清爽',
    openid: `openid-${id}`
  }, overrides)
}

function setting(userId, overrides = {}) {
  return Object.assign({
    user_id: userId,
    self_view_text: '重视真诚、责任、稳定和沟通',
    target_view_text: '希望对方真诚、责任、稳定和沟通',
    other_requirements: '共同规划生活，尊重边界',
    psych_profile_json: psych,
    like_baby_plan: '3-5年内'
  }, overrides)
}

function rankedItem(id, score = 80, pass = true) {
  return {
    candidate: user(id),
    quality: { pass, reasons: pass ? [] : ['side_score'] },
    mutualScore: score,
    viewSimilarity: score,
    scoreA: { normalizedTotal: score, completeness: 100, total: score, maxTotal: 100 },
    scoreB: { normalizedTotal: score, completeness: 100, total: score, maxTotal: 100 }
  }
}

function corpusFor(users, settingsByUserId) {
  return users.reduce((out, item) => {
    out[String(item.id)] = projectCorpusDocuments(item, settingsByUserId[String(item.id)], '2026-09-01T00:00:00.000Z')
    return out
  }, {})
}

function validResponse(request, preferredRef) {
  const refs = request.candidates.map((item) => item.candidate_ref)
  const ordered = [preferredRef].concat(refs.filter((ref) => ref !== preferredRef))
  return {
    version: RERANK_VERSION,
    ranking: ordered.map((candidateRef, index) => ({
      candidate_ref: candidateRef,
      rank: index + 1,
      a_to_b_semantic_score: candidateRef === preferredRef ? 98 : 45,
      b_to_a_semantic_score: candidateRef === preferredRef ? 97 : 44,
      mutual_semantic_score: candidateRef === preferredRef ? 98 : 44,
      mutual_strengths: [],
      asymmetric_risks: [],
      confirmation_questions: [],
      evidence_tags: ['bilateral_score'],
      strength_evidence_keys: [],
      risk_evidence_keys: [],
      missing_categories: [],
      data_completeness: 0.9,
      confidence: 0.95
    }))
  }
}

const ALLOWED_RAG_CANDIDATE_KEYS = new Set([
  'candidate_ref',
  'algorithm_rank',
  'side_a_percent',
  'side_b_percent',
  'mutual_score_percent',
  'view_similarity',
  'retrieval_a_to_b',
  'retrieval_b_to_a',
  'retrieval_mutual',
  'allowed_evidence_keys',
  'retrieved_evidence',
  'conflict_signals',
  'missing_categories'
])

const FORBIDDEN_REQUEST_KEYS = new Set([
  'intenta',
  'intentb',
  'intent_a',
  'intent_b',
  'supplementa',
  'supplementb',
  'supplement_a',
  'supplement_b',
  'sanitized_text',
  'evidence_text',
  'query_evidence_text',
  'prompt',
  'response',
  'response_text',
  'openid',
  'unionid',
  'phone',
  'mobile',
  'secret',
  'token'
])

function assertRedactedRagRequest(request, forbiddenTexts = []) {
  assert.deepStrictEqual(Object.keys(request).sort(), ['candidates', 'constraints', 'task', 'version'])
  assert.strictEqual(Reflect.ownKeys(request).some((key) => typeof key === 'symbol'), false)
  request.candidates.forEach((candidate) => {
    Object.keys(candidate).forEach((key) => {
      assert(ALLOWED_RAG_CANDIDATE_KEYS.has(key), `unexpected RAG candidate field: ${key}`)
    })
  })
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string') {
        forbiddenTexts.forEach((text) => assert(!value.includes(text), `forbidden request text: ${text}`))
      }
      return
    }
    Object.entries(value).forEach(([key, child]) => {
      assert(!FORBIDDEN_REQUEST_KEYS.has(String(key).toLowerCase()), `forbidden RAG request key: ${key}`)
      visit(child)
    })
  }
  visit(request)
}

async function main() {
  const viewer = user(1)
  const candidateA = user(2)
  const candidateB = user(3)
  const rejected = rankedItem(4, 80, false)
  const ranked = [rankedItem(2), rankedItem(3), rejected]
  const settingsByUserId = {
    '1': setting(1),
    '2': setting(2),
    '3': setting(3),
    '4': setting(4)
  }
  const corpus = corpusFor([viewer, candidateA, candidateB], settingsByUserId)
  settingsByUserId['1'].other_requirements = '原始用户原文 13800138000 openid-1 raw prompt model response'
  const original = await semanticRerank(ranked, viewer, settingsByUserId, {
    ragMode: 'off',
    loadCorpus: async () => { throw new Error('off must not load corpus') }
  })
  const originalIds = original.ranked.map((item) => item.candidate.id)
  assert.deepStrictEqual(originalIds, [2, 3, 4])
  assert(original.rag, 'semantic rerank must expose redacted RAG metadata')
  assert.strictEqual(original.rag.rag_mode, 'off')

  let capturedRequest = null
  const previousRerank = deepseek.rerankMutualMatchCandidates
  deepseek.rerankMutualMatchCandidates = async (request) => {
    capturedRequest = request
    return {
      enabled: true,
      response: validResponse(request, 'candidate_2'),
      provider: 'cloudbase',
      model: 'hy3'
    }
  }
  try {
    const shadow = await semanticRerank(ranked, viewer, settingsByUserId, {
      ragMode: 'shadow',
      loadCorpus: async (ids) => {
        assert.deepStrictEqual(ids.map(String), ['1', '2', '3'])
        return corpus
      }
    })
    assert.deepStrictEqual(shadow.ranked.map((item) => item.candidate.id), originalIds)
    assert.deepStrictEqual(shadow.ranked.map((item) => item.canonical_score), original.ranked.map((item) => item.canonical_score))
    assert.strictEqual(shadow.rag.shadow, true)
    assert.strictEqual(shadow.rag.retrieval_version, RETRIEVAL_VERSION)
    assert.strictEqual(shadow.rag.corpus_version, CHUNK_VERSION)
    assert.strictEqual(shadow.rag.provider, 'cloudbase')
    assert.strictEqual(shadow.rag.model, 'hy3')
    assert(capturedRequest)
    const serializedRequest = JSON.stringify(capturedRequest)
    assert(!serializedRequest.includes('sanitized_text'))
    assert(!serializedRequest.includes('openid-'))
    assert(!serializedRequest.includes('raw prompt'))
    assert(!serializedRequest.includes('model response'))
    assertRedactedRagRequest(capturedRequest, [
      '原始用户原文',
      '13800138000',
      'openid-1',
      'raw prompt',
      'model response'
    ])
    capturedRequest.candidates.forEach((candidate) => {
      candidate.retrieved_evidence.a_to_b.concat(candidate.retrieved_evidence.b_to_a).forEach((evidence) => {
        assert.deepStrictEqual(Object.keys(evidence).sort(), [
          'category', 'evidence_key', 'query_category', 'query_evidence_key', 'score'
        ].sort())
      })
    })

    const active = await semanticRerank(ranked, viewer, settingsByUserId, {
      ragMode: 'active',
      loadCorpus: async () => corpus
    })
    assert.deepStrictEqual(active.ranked.map((item) => item.candidate.id), [3, 2, 4])
    assert.strictEqual(active.rag.shadow, false)
    assert(active.ranked.every((item) => [2, 3, 4].includes(item.candidate.id)))
    assert(!JSON.stringify(active).includes('sanitized_text'))

    const providerFailure = await semanticRerank(ranked, viewer, settingsByUserId, {
      ragMode: 'active',
      loadCorpus: async () => corpus,
      rerank: async () => { throw new Error('HY3 request timeout') }
    })
    assert.deepStrictEqual(providerFailure.ranked.map((item) => item.candidate.id), originalIds)
    assert.strictEqual(providerFailure.degraded, true)
    assert.strictEqual(providerFailure.rag.reason, 'timeout')
  } finally {
    deepseek.rerankMutualMatchCandidates = previousRerank
  }

  const manyCandidates = Array.from({ length: 12 }, (_, index) => rankedItem(10 + index, 80, true))
  const manySettings = Object.assign({}, settingsByUserId)
  manyCandidates.forEach((item) => { manySettings[String(item.candidate.id)] = setting(item.candidate.id) })
  const manyCorpus = corpusFor([viewer].concat(manyCandidates.map((item) => item.candidate)), manySettings)
  let loadedOwnerIds = null
  const capped = await semanticRerank(manyCandidates, viewer, manySettings, {
    ragMode: 'shadow',
    loadCorpus: async (ids) => {
      loadedOwnerIds = ids
      return manyCorpus
    },
    rerank: async (request) => ({
      enabled: true,
      response: validResponse(request, 'candidate_1'),
      provider: 'cloudbase',
      model: 'hy3'
    })
  })
  assert.strictEqual(capped.degraded, false)
  assert.deepStrictEqual(loadedOwnerIds, [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])

  const previousEnv = {}
  ;['AI_PROVIDER', 'AI_GROUP', 'AI_MODEL', 'LLM_MODEL', 'DEEPSEEK_MATCH_RERANK_MODEL'].forEach((key) => {
    previousEnv[key] = process.env[key]
  })
  const previousDefaultRerank = deepseek.rerankMutualMatchCandidates
  let invalidConfigCalled = false
  process.env.AI_PROVIDER = 'deepseek'
  process.env.AI_MODEL = 'luna'
  process.env.LLM_MODEL = 'deepseek-chat'
  delete process.env.DEEPSEEK_MATCH_RERANK_MODEL
  deepseek.rerankMutualMatchCandidates = async () => {
    invalidConfigCalled = true
    return { enabled: false, response: null, provider: 'deepseek', model: 'luna' }
  }
  try {
    const invalidConfig = await semanticRerank(ranked, viewer, settingsByUserId, {
      ragMode: 'active',
      loadCorpus: async () => corpus
    })
    assert.strictEqual(invalidConfig.degraded, true)
    assert.strictEqual(invalidConfig.rag.reason, 'provider_config_invalid')
    assert.strictEqual(invalidConfig.rag.provider, 'cloudbase')
    assert.strictEqual(invalidConfig.rag.model, 'hy3')
    assert.strictEqual(invalidConfigCalled, false)
    let injectedInvalidConfigCalled = false
    const injectedInvalidConfig = await semanticRerank(ranked, viewer, settingsByUserId, {
      ragMode: 'shadow',
      loadCorpus: async () => corpus,
      rerank: async () => {
        injectedInvalidConfigCalled = true
        return { enabled: false, response: null, provider: 'deepseek', model: 'luna' }
      }
    })
    assert.strictEqual(injectedInvalidConfig.degraded, true)
    assert.strictEqual(injectedInvalidConfig.rag.reason, 'provider_config_invalid')
    assert.strictEqual(injectedInvalidConfigCalled, false, 'injected adapters must not bypass production HY3 config')
  } finally {
    deepseek.rerankMutualMatchCandidates = previousDefaultRerank
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  }

  const userHandlerSource = require('fs').readFileSync(
    require.resolve('../../miniprogram/cloudfunctions/api/handlers/user'),
    'utf8'
  )
  assert(userHandlerSource.includes('syncUserCorpus'), 'profile writes must synchronize the sparse corpus')
  assert(userHandlerSource.includes('rag_corpus_stale'), 'sync failures must leave an observable reconciliation marker')
  ;['updateProfile', 'cancel', 'claimFree'].forEach((handlerName) => {
    const start = userHandlerSource.indexOf(`async function ${handlerName}`)
    const end = userHandlerSource.indexOf('\nasync function ', start + 1)
    const body = userHandlerSource.slice(start, end < 0 ? undefined : end)
    assert(body.includes('syncCorpusBestEffort'), `${handlerName} must synchronize or tombstone corpus state`)
  })

  const previousGroupRerank = deepseek.rerankMutualMatchCandidates
  let invalidGroupCalled = false
  process.env.AI_PROVIDER = 'cloudbase'
  process.env.AI_GROUP = 'luna'
  process.env.AI_MODEL = 'hy3'
  process.env.LLM_MODEL = 'hy3'
  delete process.env.DEEPSEEK_MATCH_RERANK_MODEL
  deepseek.rerankMutualMatchCandidates = async () => {
    invalidGroupCalled = true
    return { enabled: false, response: null, provider: 'cloudbase', model: 'hy3' }
  }
  try {
    const invalidGroup = await semanticRerank(ranked, viewer, settingsByUserId, {
      ragMode: 'shadow',
      loadCorpus: async () => corpus
    })
    assert.strictEqual(invalidGroup.degraded, true)
    assert.strictEqual(invalidGroup.rag.reason, 'provider_config_invalid')
    assert.strictEqual(invalidGroup.rag.provider, 'cloudbase')
    assert.strictEqual(invalidGroup.rag.model, 'hy3')
    assert.strictEqual(invalidGroupCalled, false)
  } finally {
    deepseek.rerankMutualMatchCandidates = previousGroupRerank
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  }

  const malicious = await semanticRerank(ranked, viewer, settingsByUserId, {
    ragMode: 'active',
    loadCorpus: async () => corpus,
    rerank: async (request) => ({
      enabled: true,
      response: {
        version: RERANK_VERSION,
        ranking: request.candidates.map((item, index) => ({
          candidate_ref: item.candidate_ref,
          rank: index + 1,
          a_to_b_semantic_score: 90,
          b_to_a_semantic_score: 90,
          mutual_semantic_score: 90,
          mutual_strengths: [],
          asymmetric_risks: [],
          confirmation_questions: [],
          evidence_tags: [],
          strength_evidence_keys: [],
          risk_evidence_keys: [],
          missing_categories: [],
          data_completeness: 0.9,
          confidence: 0.9
        }))
      },
      provider: 'secret-token',
      model: 'prompt-response',
      candidate: { id: 999, openid: 'must-not-replace' },
      sanitized_text: 'must-not-leak',
      prompt: 'raw prompt',
      response_text: 'model response'
    })
  })
  assert.deepStrictEqual(malicious.ranked.map((item) => item.candidate.id), [2, 3, 4])
  assert.strictEqual(malicious.rag.provider, '')
  assert.strictEqual(malicious.rag.model, '')
  assert(!JSON.stringify(malicious).includes('must-not-replace'))
  assert(!JSON.stringify(malicious).includes('must-not-leak'))

  const insufficient = await semanticRerank(ranked, viewer, settingsByUserId, {
    ragMode: 'shadow',
    loadCorpus: async () => ({})
  })
  assert.deepStrictEqual(insufficient.ranked.map((item) => item.candidate.id), originalIds)
  assert.strictEqual(insufficient.degraded, true)
  assert.strictEqual(insufficient.rag.reason, 'sparse_retrieval_insufficient')
  assert.strictEqual(insufficient.rag.provider, '')

  const cloud = require('../../miniprogram/cloudfunctions/api/node_modules/wx-server-sdk')
  cloud.init({ env: 'task3-selfcheck' })
  const dbPath = require.resolve('../../miniprogram/cloudfunctions/api/lib/db')
  const userPath = require.resolve('../../miniprogram/cloudfunctions/api/handlers/user')
  const handlerPath = require.resolve('../../miniprogram/cloudfunctions/api/handlers/match')
  const db = require(dbPath)
  const userHandler = require(userPath)
  const originalDbMethods = {}
  ;['first', 'addWithId', 'updateByDoc', 'listChunksByOwnerIds', 'upsertChunk', 'disableChunks', 'now'].forEach((key) => {
    originalDbMethods[key] = db[key]
  })
  const originalCurrentUser = userHandler.currentUser
  let syncAttempts = 0
  db.first = async () => null
  db.addWithId = async (name, data, prefix) => Object.assign({}, data, {
    _id: `${prefix || name}_901`,
    id: 901,
    create_time: new Date('2026-09-01T00:00:00.000Z'),
    update_time: new Date('2026-09-01T00:00:00.000Z')
  })
  db.updateByDoc = async (name, row, data) => Object.assign({}, row, data)
  db.listChunksByOwnerIds = async () => []
  db.upsertChunk = async () => {
    syncAttempts += 1
    throw new Error('SECRET_SYNC_FAILURE openid-1')
  }
  db.disableChunks = async () => 0
  db.now = () => new Date('2026-09-01T00:00:00.000Z')
  userHandler.currentUser = async () => viewer
  delete require.cache[handlerPath]
  try {
    const handler = require(handlerPath)
    const saved = await handler.saveSetting({
      self_view_text: '重视真诚和责任',
      target_view_text: '希望对方稳定沟通',
      other_requirements: '尊重边界，愿意沟通'
    }, { OPENID: viewer.openid })
    assert.strictEqual(saved.id, 901)
    assert.strictEqual(saved.rag_sync.synced, false)
    assert.strictEqual(saved.rag_sync.reason, 'corpus_unavailable')
    assert.strictEqual(syncAttempts, 1)
    assert(!JSON.stringify(saved).includes('SECRET_SYNC_FAILURE'))
  } finally {
    Object.entries(originalDbMethods).forEach(([key, value]) => { db[key] = value })
    userHandler.currentUser = originalCurrentUser
    delete require.cache[handlerPath]
  }
  console.log('PASS sparse RAG integration preserves hard gates, shadow ordering, and redacted HY3 boundary')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
