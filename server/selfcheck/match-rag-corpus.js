'use strict'

const assert = require('assert')
const crypto = require('crypto')
const {
  projectCorpusDocuments,
  syncUserCorpus,
  loadCorpusForUserIds,
  backfillCorpus,
  RETRIEVAL_VERSION,
  CHUNK_VERSION,
  makeDocumentId
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
  const userPageRequests = []
  const orderedUsers = users.slice().sort((left, right) => Number(left.id) - Number(right.id))
  const settingsByUserId = Object.assign({}, settings)
  return {
    writes,
    disables,
    userPageRequests,
    rows,
    async listUsersPage({ afterId = 0, limit = 20 } = {}) {
      userPageRequests.push({ afterId: Number(afterId || 0), limit: Number(limit) || 20 })
      const cursor = Number(afterId || 0)
      return orderedUsers
        .filter((user) => Number(user.id) > cursor)
        .slice(0, Math.min(21, Number(limit) || 20))
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
  self_view_text: '我重视真诚和责任，愿意坦诚沟通，openid=secret-value，手机13800138000',
  target_view_text: '希望对方稳重可靠，愿意共同成长，微信号wx_secret'
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
  for (const value of [false, 'false', 0, '0', 'no', ' NO ']) {
    assert.strictEqual(
      projectCorpusDocuments(Object.assign({}, userA, { metadata: { rag_allowed: value } }), settingA, '2026-09-01T00:00:00.000Z').length,
      0
    )
  }
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, {
      provenance: { source: { kind: 'benchmark', manifest: { dataset_version: 'speed-dating-native-v1' } } }
    }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, {
      provenance: { manifest: { dataset: { dataset_version: 'v1.6' } } }
    }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, {
      provenance: { type: 'external_benchmark', dataset: { name: 'mystery-set' } }
    }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, { metadata: 'v1.6' }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  assert.strictEqual(
    projectCorpusDocuments(Object.assign({}, userA, { metadata: ['speed-dating-native-v1'] }), settingA, '2026-09-01T00:00:00.000Z').length,
    0
  )
  const chineseSensitive = projectCorpusDocuments(userA, {
    self_view_text: '我在字节跳动任职，工作内容稳定',
    target_view_text: '月收入两万元，年薪约二十万，希望彼此尊重'
  }, '2026-09-01T00:00:00.000Z')
  assert.ok(!JSON.stringify(chineseSensitive).includes('字节跳动'))
  assert.ok(!JSON.stringify(chineseSensitive).includes('两万元'))
  assert.ok(!JSON.stringify(chineseSensitive).includes('二十万'))
  assert.ok(!JSON.stringify(chineseSensitive).includes('任职'))
  const safeConcepts = projectCorpusDocuments(userA, {
    self_view_text: '工作生活平衡，也喜欢在路上旅行和室内运动',
    target_view_text: '希望对方真诚沟通'
  }, '2026-09-01T00:00:00.000Z')
  const safeConceptJson = JSON.stringify(safeConcepts)
  assert.ok(safeConceptJson.includes('工作生活平衡'))
  assert.ok(safeConceptJson.includes('旅行'))
  assert.ok(safeConceptJson.includes('运动'))
  assert.ok(safeConcepts.every((row) => !row.sanitized_text.includes('在路上') && !row.sanitized_text.includes('室内')))
  assert.ok(safeConcepts.every((row) => !JSON.stringify(row.tokens).match(/腾讯|字节跳动|两万|二十万|员工|任职/)))
  for (const sensitiveText of ['我来自腾讯', '腾讯员工', '每月两万', '二十万']) {
    const sensitive = projectCorpusDocuments(userA, { self_view_text: sensitiveText }, '2026-09-01T00:00:00.000Z')
    assert.ok(!JSON.stringify(sensitive).includes('腾讯'))
    assert.ok(!JSON.stringify(sensitive).match(/两万|二十万|员工/))
  }
  const controlled = projectCorpusDocuments(
    Object.assign({}, userB, { city: '深圳市', baby_plan: '3-5年内' }),
    {
      self_view_text: '真诚沟通',
      psych_profile_json: JSON.stringify({
        conflict_style: '愿意沟通',
        career_family: '事业与家庭平衡',
        money_view: '每月两万'
      })
    },
    '2026-09-01T00:00:00.000Z'
  )
  assert.strictEqual(controlled.find((row) => row.category === 'city_plan').sanitized_text, '深圳')
  assert.strictEqual(controlled.find((row) => row.category === 'marriage_and_baby').sanitized_text, '3-5年内')
  assert.ok(controlled.some((row) => row.category === 'life_plan' && row.sanitized_text === '事业家庭平衡'))
  assert.ok(controlled.some((row) => row.category === 'relationship_style' && row.sanitized_text.includes('冲突沟通')))
  assert.ok(!JSON.stringify(controlled).match(/每月两万|事业与家庭平衡|愿意沟通/))
  const addressUser = Object.assign({}, userB, { city: '深圳市南山区科技园5号' })
  const addressRows = projectCorpusDocuments(addressUser, settingB, '2026-09-01T00:00:00.000Z')
  assert.strictEqual(addressRows.some((row) => row.category === 'city_plan'), false)
  assert.ok(!JSON.stringify(addressRows).match(/南山区|科技园|5号/))
  const nonCityRows = projectCorpusDocuments(Object.assign({}, userB, { city: '腾讯' }), settingB, '2026-09-01T00:00:00.000Z')
  assert.strictEqual(nonCityRows.some((row) => row.category === 'city_plan'), false)
  for (const city of ['腾讯市', '南山科技园市']) {
    const forgedCityRows = projectCorpusDocuments(Object.assign({}, userB, { city }), settingB, '2026-09-01T00:00:00.000Z')
    assert.strictEqual(forgedCityRows.some((row) => row.category === 'city_plan'), false)
    assert.ok(!JSON.stringify(forgedCityRows).includes(city))
    assert.ok(forgedCityRows.every((row) => !row.tokens.some((token) => token.includes(city.replace(/市$/, '')))))
  }
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

  const historicalRepository = createRepository([], {})
  for (let index = 0; index < 25; index += 1) {
    const evidenceKey = `city_plan:${index.toString(16).padStart(16, '0')}`
    historicalRepository.rows.set(makeDocumentId(7, evidenceKey), {
      _id: makeDocumentId(7, evidenceKey),
      owner_user_id: 7,
      evidence_key: evidenceKey,
      category: 'city_plan',
      sanitized_text: '广州',
      tokens: ['广州'],
      content_hash: 'a'.repeat(16),
      chunk_version: CHUNK_VERSION,
      retrieval_version: RETRIEVAL_VERSION,
      source_profile_version: 'b'.repeat(40),
      enabled: true,
      updated_at: '2026-09-01T00:00:00.000Z'
    })
  }
  const historical = await loadCorpusForUserIds([7], historicalRepository)
  assert.strictEqual(historical['7'].length, 25)
  assert.strictEqual(await historicalRepository.disableChunks(7, []), 25)

  const dryRepository = createRepository([userA, userB], { 1: settingA, 2: settingB })
  const dryRun = await backfillCorpus({ dry_run: true, page_limit: 1 }, dryRepository)
  assert.deepStrictEqual(dryRun, { scanned: 2, eligible: 2, written: 0, disabled: 0, dry_run: true, next_cursor: null })
  assert.strictEqual(dryRepository.writes.length, 0)
  assert.strictEqual(dryRepository.disables.length, 0)

  const backfillRepository = createRepository([userA, userB], { 1: settingA, 2: settingB })
  const filled = await backfillCorpus({ dry_run: false, page_limit: 1 }, backfillRepository)
  assert.deepStrictEqual(filled, { scanned: 2, eligible: 2, written: 6, disabled: 0, dry_run: false, next_cursor: null })
  const rerun = await backfillCorpus({ dry_run: false, cursor: 0, page_limit: 1 }, backfillRepository)
  assert.deepStrictEqual(rerun, { scanned: 2, eligible: 2, written: 0, disabled: 0, dry_run: false, next_cursor: null })

  const revokedUser = Object.assign({}, userB, { id: 3, status: 0, member_status: 'approved' })
  const zeroDocumentUser = { id: 4, status: 1, memberStatus: 'approved' }
  delete zeroDocumentUser.member_status
  const qaUser = Object.assign({}, userB, { id: 5, account_mode: 'internal_qa' })
  const stringStatusUser = Object.assign({}, userB, { id: 6, status: '1' })
  const missingApprovalUser = Object.assign({}, userB, { id: 7 })
  delete missingApprovalUser.member_status
  const ineligibleRepository = createRepository(
    [revokedUser, zeroDocumentUser, qaUser, stringStatusUser, missingApprovalUser],
    { 3: settingB, 4: {}, 5: settingB, 6: settingB, 7: settingB }
  )
  for (const ownerUserId of [3, 4, 5, 6, 7]) {
    const evidenceKey = `city_plan:${ownerUserId.toString(16).padStart(16, '0')}`
    ineligibleRepository.rows.set(makeDocumentId(ownerUserId, evidenceKey), {
      _id: makeDocumentId(ownerUserId, evidenceKey),
      owner_user_id: ownerUserId,
      evidence_key: evidenceKey,
      category: 'city_plan',
      sanitized_text: '旧语料',
      tokens: ['旧语料'],
      content_hash: 'c'.repeat(16),
      chunk_version: CHUNK_VERSION,
      retrieval_version: RETRIEVAL_VERSION,
      source_profile_version: 'd'.repeat(40),
      enabled: true,
      updated_at: '2026-09-01T00:00:00.000Z'
    })
  }
  const ineligible = await backfillCorpus({ dry_run: false, page_limit: 1 }, ineligibleRepository)
  assert.strictEqual(ineligible.scanned, 5)
  assert.strictEqual(ineligible.eligible, 0)
  assert.strictEqual(ineligible.written, 0)
  assert.strictEqual(ineligible.disabled, 5)
  assert.strictEqual(ineligibleRepository.disables.length, 5)
  assert.ok([...ineligibleRepository.rows.values()].every((row) => row.enabled === false))

  const manyUsers = Array.from({ length: 21 }, (_, index) => Object.assign({}, userB, { id: 100 + index }))
  const manySettings = {}
  manyUsers.forEach((user) => { manySettings[String(user.id)] = settingB })
  const paginationRepository = createRepository(manyUsers, manySettings)
  const firstPage = await backfillCorpus({ dry_run: true, page_limit: 1 }, paginationRepository)
  assert.strictEqual(firstPage.scanned, 20)
  assert.strictEqual(firstPage.next_cursor, 119)
  assert.strictEqual(firstPage.has_more, true)
  const lastPage = await backfillCorpus({ dry_run: true, cursor: firstPage.next_cursor, page_limit: 1 }, paginationRepository)
  assert.deepStrictEqual(lastPage, { scanned: 1, eligible: 1, written: 0, disabled: 0, dry_run: true, next_cursor: null })

  const exactTwentyUsers = Array.from({ length: 20 }, (_, index) => Object.assign({}, userB, { id: 200 + index }))
  const exactTwentySettings = {}
  exactTwentyUsers.forEach((user) => { exactTwentySettings[String(user.id)] = settingB })
  const exactTwentyRepository = createRepository(exactTwentyUsers, exactTwentySettings)
  const exactTwenty = await backfillCorpus({ dry_run: true, page_limit: 1 }, exactTwentyRepository)
  assert.deepStrictEqual(exactTwenty, { scanned: 20, eligible: 20, written: 0, disabled: 0, dry_run: true, next_cursor: null })
  assert.strictEqual(exactTwentyRepository.userPageRequests[0].limit, 21)
  assert.strictEqual(exactTwentyRepository.userPageRequests.length, 1)

  console.log('PASS sanitized sparse RAG corpus synchronization and backfill')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
