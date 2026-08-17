const assert = require('assert')
const {
  buildEvidenceChunks,
  CHUNK_SCHEMA_VERSION,
  CHUNK_CATEGORIES
} = require('../../miniprogram/cloudfunctions/api/lib/matchEvidenceChunks')
const {
  createEmbeddingProvider,
  cosineSimilarity
} = require('../../miniprogram/cloudfunctions/api/lib/embeddingProvider')

async function main() {
  assert.strictEqual(CHUNK_SCHEMA_VERSION, 'evidence_chunk_v1')
  assert.ok(CHUNK_CATEGORIES.includes('values_self'))
  assert.ok(CHUNK_CATEGORIES.includes('appearance_target'))

  const user = {
    id: 7,
    phone: '13800138000',
    openid: 'omSecretOpenId',
    city: '汕头',
    baby_plan: '3-5年内',
    appearance_description: '清爽自然，手机号13800138000不要外传',
    appearance_want: '干净稳重'
  }
  const settings = {
    self_view_text: '重视真诚和责任 openid=omSecretOpenId',
    target_view_text: '希望对方稳重有担当',
    other_requirements: '不要抽烟，微信号abc_secret_wx',
    psych_profile_json: JSON.stringify({
      marriage_pace: '稳定推进',
      conflict_style: '及时沟通',
      security_space: '亲密也独立',
      family_boundary: '边界清晰',
      money_view: '共同规划',
      career_family: '动态平衡'
    })
  }

  const chunks = buildEvidenceChunks(user, settings)
  assert.ok(chunks.length >= 5)
  assert.ok(chunks.every((chunk) => chunk.schema_version === CHUNK_SCHEMA_VERSION))
  assert.ok(chunks.every((chunk) => CHUNK_CATEGORIES.includes(chunk.category)))
  assert.ok(chunks.every((chunk) => chunk.evidence_key && chunk.content_hash && chunk.sanitized_text))
  assert.ok(chunks.every((chunk) => Number(chunk.owner_user_id) === 7))
  assert.ok(!JSON.stringify(chunks).includes('13800138000'))
  assert.ok(!JSON.stringify(chunks).includes('omSecretOpenId'))
  assert.ok(!JSON.stringify(chunks).includes('abc_secret_wx'))

  const valuesSelf = chunks.find((chunk) => chunk.category === 'values_self')
  assert.ok(valuesSelf.sanitized_text.includes('真诚'))
  assert.ok(valuesSelf.completeness > 0)

  const sameTextForOtherUser = buildEvidenceChunks({ id: 8 }, settings)
    .find((chunk) => chunk.category === 'values_self')
  assert.notStrictEqual(sameTextForOtherUser.evidence_key, valuesSelf.evidence_key)

  const cleared = buildEvidenceChunks({ id: 7 }, { self_view_text: '', target_view_text: '' })
  assert.strictEqual(cleared.find((chunk) => chunk.category === 'values_self'), undefined)

  const updated = buildEvidenceChunks(user, Object.assign({}, settings, {
    self_view_text: '重视真诚责任和长期承诺'
  }))
  const updatedSelf = updated.find((chunk) => chunk.category === 'values_self')
  assert.notStrictEqual(updatedSelf.content_hash, valuesSelf.content_hash)

  const none = createEmbeddingProvider({ provider: 'none' })
  await assert.rejects(() => none.embed(['hello']), (err) => {
    assert.ok(/semantic_retrieval_unavailable/.test(String(err && err.code || err && err.message || err)))
    return true
  })

  const stub = createEmbeddingProvider({ provider: 'stub' })
  assert.strictEqual(stub.name, 'stub')
  const first = await stub.embed(['重视真诚和责任'])
  const second = await stub.embed(['重视真诚和责任'])
  const other = await stub.embed(['完全不同的生活计划'])
  assert.strictEqual(first.length, 1)
  assert.deepStrictEqual(first[0], second[0])
  assert.notDeepStrictEqual(first[0], other[0])
  assert.ok(cosineSimilarity(first[0], second[0]) > 0.99)
  assert.ok(cosineSimilarity(first[0], other[0]) < 0.99)
  console.log('PASS evidence chunks and embedding provider adapter')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
