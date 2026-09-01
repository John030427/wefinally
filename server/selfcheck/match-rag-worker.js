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
  return /sanitized_text|prompt|response|openid|unionid|phone|mobile|secret|token|原始文本/i.test(text)
}

function fixtureProfiles() {
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
        appearance_description: '自然清爽'
      },
      settings: {
        self_view_text: '重视真诚、责任、稳定和沟通',
        target_view_text: '希望对方真诚、稳定、愿意沟通',
        other_requirements: '尊重边界，共同规划生活'
      }
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
        appearance_description: '干净阳光'
      },
      settings: {
        self_view_text: '真诚负责，愿意稳定沟通',
        target_view_text: '希望对方尊重边界，重视家庭',
        other_requirements: '工作生活平衡，愿意共同规划'
      }
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
  assert.deepStrictEqual(
    worker.mapWorkerEvent({ action: 'runFormalMatchBatch' }, WORKER_SECRET, () => 1730000000000),
    defaultTimer,
    'explicit formal action must retain the timer contract'
  )

  assert.throws(
    () => worker.mapWorkerEvent({ action: 'unexpectedAction' }, WORKER_SECRET),
    /未知 worker action/
  )
  const lowerBound = worker.mapWorkerEvent(
    { action: 'backfillRagCorpus', payload: { page_limit: 0 } },
    WORKER_SECRET
  )
  assert.strictEqual(lowerBound.payload.page_limit, 1)

  const previousSecret = process.env.MATCH_WORKER_SECRET
  process.env.MATCH_WORKER_SECRET = WORKER_SECRET
  const api = require('../../miniprogram/cloudfunctions/api/index.js')
  const db = require('../../miniprogram/cloudfunctions/api/lib/db')
  const corpus = require('../../miniprogram/cloudfunctions/api/lib/matchRagCorpus')
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
      'corpus_version',
      'evidence_keys',
      'model',
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
    assert.strictEqual(forbidden(smokeResult.data), false)

    const smokeDenied = await api.main({
      action: 'smokeSparseRag',
      payload: { worker_secret: WORKER_SECRET, fixture_only: true, profiles: [{ id: 101, profile: { openid: 'must-not-read' } }] }
    })
    assert.strictEqual(smokeDenied.success, false)
    assert.strictEqual(smokeDenied.code, 400)

    const unknown = await api.main({ action: 'unknownWorkerAction', payload: { worker_secret: WORKER_SECRET } })
    assert.strictEqual(unknown.success, false)
    assert.match(unknown.error, /Unknown action/)
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
