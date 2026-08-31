'use strict'

const assert = require('assert')
const crypto = require('crypto')
const {
  projectCorpusDocuments,
  syncUserCorpus,
  loadCorpusForUserIds,
  backfillCorpus,
  RETRIEVAL_VERSION,
  CHUNK_VERSION
} = require('../../miniprogram/cloudfunctions/api/lib/matchRagCorpus')
const collections = require('../../miniprogram/cloudfunctions/api/lib/collections')
const { canBootstrapCollection } = require('../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy')

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createRepository(users, settings) {
  const rows = new Map()
  const writes = []
  const disables = []
  const orderedUsers = users.slice().sort((left, right) => Number(left.id) - Number(right.id))
  const settingsByUserId = Object.assign({}, settings)
  return {
    writes,
    disables,
    rows,
    async listUsersPage({ afterId = 0, limit = 20 } = {}) {
      const cursor = Number(afterId || 0)
      return orderedUsers
        .filter((user) => Number(user.id) > cursor)
        .slice(0, Math.min(20, Number(limit) || 20))
        .map(clone)
    },
    async findSetting(userId) {
      return clone(settingsByUserId[String(userId)] || null)
    },
    async listChunksByOwnerIds(ids) {
      const allowed = new Set((ids || []).map((id) => String(id)))
      return [...rows.values()]
        .filter((row) => allowed.has(String(row.owner_user_id)))
        .map(clone)
    },
    async upsertChunk(document) {
      writes.push(clone(document))
      rows.set(String(document._id), clone(document))
      return clone(document)
    },
    async disableChunks(ownerUserId, activeEvidenceKeys) {
      const active = new Set(activeEvidenceKeys || [])
      let disabled = 0
      for (const [id, row] of rows.entries()) {
        if (Number(row.owner_user_id) !== Number(ownerUserId)
          || row.enabled !== true
          || active.has(row.evidence_key)) continue
        const next = Object.assign({}, row, { enabled: false })
        rows.set(id, next)
        disabled += 1
      }
      disables.push({ ownerUserId: Number(ownerUserId), activeEvidenceKeys: [...active] })
      return disabled
    }
  }
}

const userA = {
  id: 1,
  status: 1,
  member_status: 'approved',
  city: '广州',
  openid: 'openid-must-not-persist',
  phone: '13800138000',
  employer: '不应进入语料的雇主',
  income_range: '精确收入20000'
}
const settingA = {
  self_view_text: '我重视真诚和责任，我在腾讯公司工作，住在深圳市南山区科技园5号，openid=secret-value，手机13800138000',
  target_view_text: '希望对方稳重可靠，愿意沟通，月收入20000，微信号wx_secret'
}
const userB = {
  id: 2,
  status: 1,
  member_status: 'approved',
  city: '深圳',
  baby_plan: '3-5年内'
}
const settingB = {
  self_view_text: '我为人稳重可靠，做事踏实'
}

async function main() {
  assert.strictEqual(collections.user_evidence_chunk, 'user_evidence_chunks')
  assert.strictEqual(canBootstrapCollection('user_evidence_chunk'), true)

  const repository = createRepository([userA, userB], { 1: settingA, 2: settingB })

  const projected = projectCorpusDocuments(userA, settingA, '2026-09-01T00:00:00.000Z')
  assert.ok(projected.length >= 3)
  assert.ok(projected.every((row) => row._id.startsWith('rag_chunk_')))
  assert.ok(projected.every((row) => row.chunk_version === CHUNK_VERSION))
  assert.ok(projected.every((row) => row.retrieval_version === RETRIEVAL_VERSION))
  assert.ok(projected.every((row) => row.enabled === true))
  assert.ok(projected.every((row) => Array.isArray(row.tokens) && row.tokens.length > 0))
  assert.ok(projected.every((row) => !JSON.stringify(row).match(/openid|13800138000|wx_secret|雇主|精确收入|vector|embedding/i)))
  assert.ok(!JSON.stringify(projected).includes('腾讯'))
  assert.ok(!JSON.stringify(projected).includes('5号'))
  assert.strictEqual(
    projected[0]._id,
    `rag_chunk_${crypto.createHash('sha256').update(`1:${projected[0].evidence_key}`).digest('hex').slice(0, 32)}`
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, { match_version: 'v1.7' }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, { source_dataset: 'speed-dating-native-v1' }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, { rag_eligible: false }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(userA, settingA, '2026-09-02T00:00:00.000Z')[0].source_profile_version,
    projected[0].source_profile_version
  )
  assert.notStrictEqual(
    projectCorpusDocuments(userA, Object.assign({}, settingA, { target_view_text: '希望对方温柔可靠' }), '2026-09-01T00:00:00.000Z')[0].source_profile_version,
    projected[0].source_profile_version
  )

  const first = await syncUserCorpus(userA, settingA, repository)
  assert.strictEqual(first.upserted, 3)
  assert.strictEqual(first.disabled, 0)
  assert.ok(first.source_profile_version)
  const writeCount = repository.writes.length

  const second = await syncUserCorpus(userA, settingA, repository)
  assert.strictEqual(second.upserted, 0)
  assert.strictEqual(second.disabled, 0)
  assert.strictEqual(repository.writes.length, writeCount)

  const rows = [...repository.rows.values()]
  assert.ok(rows.every((row) => row.retrieval_version === 'sparse_bm25_v1'))
  assert.ok(rows.every((row) => !JSON.stringify(row).match(/openid|13800138000|wx_secret|vector|embedding/i)))

  const removed = Object.assign({}, settingA, { target_view_text: '', other_requirements: '' })
  const afterRemoval = await syncUserCorpus(userA, removed, repository)
  assert.strictEqual(afterRemoval.disabled, 1)
  assert.strictEqual([...repository.rows.values()].filter((row) => row.enabled === false).length, 1)

  const loaded = await loadCorpusForUserIds([1, 2, 999], repository)
  assert.ok(Array.isArray(loaded['1']))
  assert.ok(Array.isArray(loaded['2']))
  assert.strictEqual(loaded['1'].some((row) => row.enabled === false), false)
  assert.ok(!JSON.stringify(loaded).match(/vector|embedding|openid/i))

  const dryRepository = createRepository([userA, userB], { 1: settingA, 2: settingB })
  const dryRun = await backfillCorpus({ dry_run: true, page_limit: 1 }, dryRepository)
  assert.deepStrictEqual(dryRun, { scanned: 2, eligible: 2, written: 0, disabled: 0, dry_run: true, next_cursor: 2 })
  assert.strictEqual(dryRepository.writes.length, 0)
  assert.strictEqual(dryRepository.disables.length, 0)

  const backfillRepository = createRepository([userA, userB], { 1: settingA, 2: settingB })
  const filled = await backfillCorpus({ dry_run: false, page_limit: 1 }, backfillRepository)
  assert.deepStrictEqual(filled, { scanned: 2, eligible: 2, written: 6, disabled: 0, dry_run: false, next_cursor: 2 })
  const rerun = await backfillCorpus({ dry_run: false, cursor: 0, page_limit: 1 }, backfillRepository)
  assert.deepStrictEqual(rerun, { scanned: 2, eligible: 2, written: 0, disabled: 0, dry_run: false, next_cursor: 2 })

  console.log('PASS sanitized sparse RAG corpus synchronization and backfill')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
