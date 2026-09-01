'use strict'

const assert = require('assert')
const Module = require('module')

const WORKER_SECRET = '01234567890123456789012345678901'

function loadWorkerWithCloudStub() {
  const calls = []
  const cloud = {
    init() {},
    callFunction: async (options) => {
      calls.push(options)
      return { result: { success: true, data: { action: options.data.action } } }
    }
  }
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    delete require.cache[require.resolve('../../miniprogram/cloudfunctions/match-worker/index.js')]
    return {
      worker: require('../../miniprogram/cloudfunctions/match-worker/index.js'),
      calls
    }
  } finally {
    Module._load = originalLoad
  }
}

function forbidden(value) {
  const text = JSON.stringify(value)
  return /sanitized_text|prompt|response|openid|unionid|phone|mobile|wechat|secret|token|raw_text|original_text|原始文本|原始文本/i.test(text)
}

function fixtureProfiles() {
  const psych = JSON.stringify({
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '亲密也独立',
    family_boundary: '边界清晰',
    money_view: '共同规划',
    career_family: '动态平衡'
  })
  const settings = (userId) => ({
    user_id: userId,
    self_view_text: '真诚、责任、稳定、沟通、家庭、共同规划',
    target_view_text: '真诚、责任、稳定、沟通、家庭、共同规划',
    other_requirements: '尊重边界、共同规划生活、工作生活平衡',
    psych_profile_json: psych,
    like_baby_plan: '3-5年内',
    age_min: 18,
    age_max: 80,
    height_min: 160,
    height_max: 190,
    min_education: '本科',
    like_circle_ids: '1'
  })
  return [
    {
      id: 101,
      fixture_only: true,
      sanitized: true,
      profile: {
        id: 101,
        gender: 1,
        birth_year: 1990,
        city: '广州',
        baby_plan: '3-5年内',
        height_range: '170cm',
        education: '本科',
        identity_circle_ids: ['1'],
        appearance_description: '自然清爽'
      },
      settings: settings(101)
    },
    {
      id: 102,
      fixture_only: true,
      sanitized: true,
      profile: {
        id: 102,
        gender: 2,
        birth_year: 1992,
        city: '广州',
        baby_plan: '3-5年内',
        height_range: '170cm',
        education: '本科',
        identity_circle_ids: ['1'],
        appearance_description: '干净阳光'
      },
      settings: settings(102)
    }
  ]
}

async function main() {
  const { worker, calls } = loadWorkerWithCloudStub()
  assert.strictEqual(typeof worker.mapWorkerEvent, 'function', 'worker must expose a pure event mapper')

  const backfill = worker.mapWorkerEvent({
    action: 'backfillRagCorpus',
    payload: { dry_run: true, cursor: 40, page_limit: 99 }
  }, WORKER_SECRET)
  assert.deepStrictEqual(backfill, {
    action: 'backfillRagCorpus',
    payload: {
      dry_run: true,
      cursor: 40,
      page_limit: 10,
      worker_secret: WORKER_SECRET
    }
  })

  const smoke = worker.mapWorkerEvent({
    action: 'smokeSparseRag',
    payload: { fixture_only: true, profiles: fixtureProfiles() }
  }, WORKER_SECRET)
  assert.strictEqual(smoke.action, 'smokeSparseRag')
  assert.strictEqual(smoke.payload.worker_secret, WORKER_SECRET)
  assert.strictEqual(smoke.payload.fixture_only, true)
  assert.strictEqual(smoke.payload.profiles.length, 2)
  assert.strictEqual(forbidden(smoke.payload.profiles), false)

  const defaultTimer = worker.mapWorkerEvent({}, WORKER_SECRET, () => 1730000000000)
  assert.deepStrictEqual(defaultTimer, {
    action: 'runFormalMatchBatch',
    payload: {
      request_id: 'timer:1730000000000',
      trigger_source: 'timer',
      worker_secret: WORKER_SECRET
    }
  })
  ;[null, '', ' ', 'runFormalMatchBatch', 'unexpectedAction'].forEach((action) => {
    assert.throws(
      () => worker.mapWorkerEvent({ action }, WORKER_SECRET, () => 1730000000000),
      (error) => error && error.message === 'INVALID_WORKER_ACTION'
    )
  })
  const inheritedAction = Object.create({ action: 'unexpectedAction' })
  assert.deepStrictEqual(
    worker.mapWorkerEvent(inheritedAction, WORKER_SECRET, () => 1730000000000),
    defaultTimer,
    'only an event without an own action property may use the timer route'
  )
  const lowerBound = worker.mapWorkerEvent(
    { action: 'backfillRagCorpus', payload: { dry_run: true, page_limit: 0 } },
    WORKER_SECRET
  )
  assert.strictEqual(lowerBound.payload.page_limit, 1)

  const previousSecret = process.env.MATCH_WORKER_SECRET
  process.env.MATCH_WORKER_SECRET = WORKER_SECRET
  const api = require('../../miniprogram/cloudfunctions/api/index.js')
  const db = require('../../miniprogram/cloudfunctions/api/lib/db')
  const corpus = require('../../miniprogram/cloudfunctions/api/lib/matchRagCorpus')
  const deepseek = require('../../miniprogram/cloudfunctions/api/lib/deepseek')
  const originalListUsersPage = db.listUsersPage
  const originalFindSetting = db.findSetting
  const originalListChunks = db.listChunksByOwnerIds
  const originalUpsertChunk = db.upsertChunk
  const originalDisableChunks = db.disableChunks
  try {
    db.listUsersPage = async (input) => {
      assert.strictEqual(input.limit, 21, 'source page size must remain 20 plus one continuation row')
      return []
    }
    db.findSetting = async () => ({})
    db.listChunksByOwnerIds = async () => []
    db.upsertChunk = async () => { throw new Error('backfill must not write in dry run') }
    db.disableChunks = async () => { throw new Error('backfill must not disable in dry run') }

    for (const invalidDryRun of ['true', 1, null, '', {}, []]) {
      const invalid = await api.main({
        action: 'backfillRagCorpus',
        payload: { worker_secret: WORKER_SECRET, dry_run: invalidDryRun, cursor: 0, page_limit: 1 }
      })
      assert.strictEqual(invalid.success, false)
      assert.strictEqual(invalid.code, 400)
      assert.strictEqual(invalid.error, 'INVALID_RAG_BACKFILL_REQUEST')
      assert.strictEqual(forbidden(invalid), false)
    }
    for (const invalidCursor of ['0', true, null, {}, [], 1.5, -1]) {
      const invalid = await api.main({
        action: 'backfillRagCorpus',
        payload: { worker_secret: WORKER_SECRET, dry_run: true, cursor: invalidCursor, page_limit: 1 }
      })
      assert.strictEqual(invalid.success, false)
      assert.strictEqual(invalid.code, 400)
      assert.strictEqual(invalid.error, 'INVALID_RAG_BACKFILL_REQUEST')
    }
    for (const invalidPageLimit of ['10', true, null, {}, [], 1.5, Infinity]) {
      const invalid = await api.main({
        action: 'backfillRagCorpus',
        payload: { worker_secret: WORKER_SECRET, dry_run: true, cursor: 0, page_limit: invalidPageLimit }
      })
      assert.strictEqual(invalid.success, false)
      assert.strictEqual(invalid.code, 400)
      assert.strictEqual(invalid.error, 'INVALID_RAG_BACKFILL_REQUEST')
    }

    const backfillResult = await api.main({
      action: 'backfillRagCorpus',
      payload: {
        worker_secret: WORKER_SECRET,
        dry_run: true,
        cursor: 0,
        page_limit: 99
      }
    })
    assert.strictEqual(backfillResult.success, true)
    assert.strictEqual(backfillResult.data.dry_run, true)
    assert.strictEqual(backfillResult.data.next_cursor, null)

    const denied = await api.main({
      action: 'backfillRagCorpus',
      payload: { worker_secret: 'wrong', dry_run: true }
    })
    assert.strictEqual(denied.success, false)
    assert.strictEqual(denied.code, 403)

    const smokeResult = await api.main({
      action: 'smokeSparseRag',
      payload: {
        worker_secret: WORKER_SECRET,
        fixture_only: true,
        profiles: fixtureProfiles()
      }
    })
    assert.strictEqual(smokeResult.success, true)
    assert.deepStrictEqual(Object.keys(smokeResult.data).sort(), [
      'candidate_set_invariant',
      'corpus_version',
      'evidence_keys',
      'input_candidate_refs',
      'model',
      'output_candidate_refs',
      'provider',
      'rag_mode',
      'reason',
      'retrieval_version',
      'score'
    ])
    assert.strictEqual(smokeResult.data.rag_mode, 'off')
    assert.strictEqual(smokeResult.data.retrieval_version, corpus.RETRIEVAL_VERSION)
    assert.strictEqual(smokeResult.data.corpus_version, corpus.CHUNK_VERSION)
    assert(Array.isArray(smokeResult.data.evidence_keys))
    assert(smokeResult.data.evidence_keys.every((key) => /^[a-z][a-z0-9_]*:[a-f0-9]{16,64}$/i.test(key)))
    assert(smokeResult.data.evidence_keys.length > 0, 'compatible smoke must return evidence keys')
    assert.deepStrictEqual(smokeResult.data.input_candidate_refs, ['candidate_102'])
    assert.deepStrictEqual(smokeResult.data.output_candidate_refs, ['candidate_102'])
    assert.strictEqual(smokeResult.data.candidate_set_invariant, true)
    assert.strictEqual(forbidden(smokeResult.data), false)

    const asymmetricProfiles = fixtureProfiles()
    asymmetricProfiles[1].settings.target_view_text = '需要独立空间、稳定节奏、清晰边界'
    const asymmetric = await api.main({
      action: 'smokeSparseRag',
      payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: asymmetricProfiles }
    })
    assert.strictEqual(asymmetric.success, true)
    assert.deepStrictEqual(asymmetric.data.input_candidate_refs, ['candidate_102'])
    assert.deepStrictEqual(asymmetric.data.output_candidate_refs, ['candidate_102'])
    assert.strictEqual(asymmetric.data.candidate_set_invariant, true)
    assert.strictEqual(forbidden(asymmetric.data), false)

    const conflictProfiles = fixtureProfiles()
    conflictProfiles[0].settings.must_baby_plan = '不考虑'
    const conflict = await api.main({
      action: 'smokeSparseRag',
      payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: conflictProfiles }
    })
    assert.strictEqual(conflict.success, true)
    assert.deepStrictEqual(conflict.data.input_candidate_refs, ['candidate_102'])
    assert.deepStrictEqual(conflict.data.output_candidate_refs, [])
    assert.strictEqual(conflict.data.candidate_set_invariant, true)
    assert.strictEqual(forbidden(conflict.data), false)

    const insufficientProfiles = [
      { id: 201, fixture_only: true, sanitized: true, profile: { id: 201, gender: 1 }, settings: {} },
      { id: 202, fixture_only: true, sanitized: true, profile: { id: 202, gender: 2 }, settings: {} }
    ]
    const insufficient = await api.main({
      action: 'smokeSparseRag',
      payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: insufficientProfiles }
    })
    assert.strictEqual(insufficient.success, true)
    assert.deepStrictEqual(insufficient.data.input_candidate_refs, ['candidate_202'])
    assert.deepStrictEqual(insufficient.data.output_candidate_refs, [])
    assert.strictEqual(insufficient.data.candidate_set_invariant, true)
    assert.strictEqual(insufficient.data.evidence_keys.length, 0)
    assert.strictEqual(forbidden(insufficient.data), false)

    const expiredProfiles = fixtureProfiles()
    expiredProfiles[1].fixture_expires_at = '2020-01-01T00:00:00.000Z'
    const expired = await api.main({
      action: 'smokeSparseRag',
      payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: expiredProfiles }
    })
    assert.strictEqual(expired.success, false)
    assert.strictEqual(expired.code, 400)
    assert.strictEqual(expired.error, 'INVALID_RAG_SMOKE_REQUEST')
    assert.strictEqual(forbidden(expired), false)

    const previousAiProvider = process.env.AI_PROVIDER
    const previousAiGroup = process.env.AI_GROUP
    const previousAiModel = process.env.AI_MODEL
    const previousRerank = deepseek.rerankMutualMatchCandidates
    process.env.AI_PROVIDER = 'cloudbase'
    process.env.AI_GROUP = 'cloudbase'
    process.env.AI_MODEL = 'hy3'
    deepseek.rerankMutualMatchCandidates = async () => ({
      enabled: true,
      provider: 'cloudbase',
      model: 'hy3',
      response: {
        version: 'match_semantic_rerank_v1',
        ranking: [{ candidate_ref: 'candidate_999', rank: 1 }]
      }
    })
    try {
      const providerFailure = await api.main({
        action: 'smokeSparseRag',
        payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: fixtureProfiles(), rag_mode: 'active' }
      })
      assert.strictEqual(providerFailure.success, true)
      assert.deepStrictEqual(providerFailure.data.input_candidate_refs, ['candidate_102'])
      assert.deepStrictEqual(providerFailure.data.output_candidate_refs, ['candidate_102'])
      assert.strictEqual(providerFailure.data.candidate_set_invariant, true)
      assert.strictEqual(providerFailure.data.reason, 'invalid_result')
      assert.strictEqual(forbidden(providerFailure.data), false)
    } finally {
      deepseek.rerankMutualMatchCandidates = previousRerank
      if (previousAiProvider === undefined) delete process.env.AI_PROVIDER
      else process.env.AI_PROVIDER = previousAiProvider
      if (previousAiGroup === undefined) delete process.env.AI_GROUP
      else process.env.AI_GROUP = previousAiGroup
      if (previousAiModel === undefined) delete process.env.AI_MODEL
      else process.env.AI_MODEL = previousAiModel
    }

    const smokeDenied = await api.main({
      action: 'smokeSparseRag',
      payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: [{ id: 101, profile: { openid: 'must-not-read' } }] }
    })
    assert.strictEqual(smokeDenied.success, false)
    assert.strictEqual(smokeDenied.code, 400)

    const unknown = await api.main({ action: 'unknownWorkerAction:secret-token', payload: { worker_secret: WORKER_SECRET } })
    assert.strictEqual(unknown.success, false)
    assert.strictEqual(unknown.code, 400)
    assert.strictEqual(unknown.error, 'UNKNOWN_ACTION')
    assert.strictEqual(forbidden(unknown), false)
    const malformedSmoke = await api.main({
      action: 'smokeSparseRag',
      payload: {
        worker_secret: WORKER_SECRET,
        fixture_only: true,
        profiles: [{ id: 101, profile: { id: 101, secret: 'do-not-return' } }, { id: 102 }]
      }
    })
    assert.strictEqual(malformedSmoke.success, false)
    assert.strictEqual(malformedSmoke.code, 400)
    assert.strictEqual(malformedSmoke.error, 'INVALID_RAG_SMOKE_REQUEST')
    assert.strictEqual(forbidden(malformedSmoke), false)
  } finally {
    db.listUsersPage = originalListUsersPage
    db.findSetting = originalFindSetting
    db.listChunksByOwnerIds = originalListChunks
    db.upsertChunk = originalUpsertChunk
    db.disableChunks = originalDisableChunks
    if (previousSecret === undefined) delete process.env.MATCH_WORKER_SECRET
    else process.env.MATCH_WORKER_SECRET = previousSecret
  }

  process.env.MATCH_WORKER_SECRET = WORKER_SECRET
  await worker.main({ action: 'backfillRagCorpus', payload: { dry_run: true, cursor: 40, page_limit: 99 } })
  assert.strictEqual(calls.length, 1)
  assert.deepStrictEqual(calls[0].data, backfill)
  console.log('PASS sparse RAG worker actions, timer routing, auth, and redacted smoke contract')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
