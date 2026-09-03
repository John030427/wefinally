const assert = require('assert')
const { hardOk, MATCH_CONFIG } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')
const { retrieveBidirectional } = require('../../miniprogram/cloudfunctions/api/lib/matchSemanticRetrieval')
const { createEmbeddingProvider } = require('../../miniprogram/cloudfunctions/api/lib/embeddingProvider')
const { semanticRerank } = require('../../miniprogram/cloudfunctions/api/lib/semanticMatchService')

async function main() {
  const synonymPair = {
    userA: { id: 1, gender: 1, birth_year: 1992, city: '汕头', baby_plan: '3-5年内', appearance_description: '清爽' },
    settingsA: {
      self_view_text: '我重视踏实和担当',
      target_view_text: '希望对方稳重有责任心',
      age_min: 25,
      age_max: 40
    },
    userB: { id: 2, gender: 2, birth_year: 1995, city: '汕头', baby_plan: '3-5年内', appearance_description: '自然' },
    settingsB: {
      self_view_text: '我为人稳重有责任心',
      target_view_text: '希望对方踏实有担当',
      age_min: 25,
      age_max: 40
    }
  }

  assert.strictEqual(hardOk(synonymPair.settingsA, synonymPair.userB, MATCH_CONFIG), true)
  const synonym = await retrieveBidirectional(synonymPair, { providerName: 'stub' })
  assert.strictEqual(synonym.retrieval_version, 'semantic_retrieval_v1')
  assert.ok(synonym.a_to_b.score >= 60, `A→B synonym recall got ${synonym.a_to_b.score}`)
  assert.ok(synonym.b_to_a.score >= 60, `B→A synonym recall got ${synonym.b_to_a.score}`)
  assert.ok(synonym.mutual_score >= 60)
  assert.ok(synonym.a_to_b.top_evidence.length >= 1)
  assert.ok(synonym.a_to_b.top_evidence.every((item) => item.evidence_text && item.query_evidence_text))

  const asymmetric = await retrieveBidirectional({
    userA: { id: 1, gender: 1, birth_year: 1990, city: '汕头', baby_plan: '不要孩子', appearance_description: '安静气质' },
    settingsA: { self_view_text: '我喜欢安静读书', target_view_text: '对方也喜欢安静相处' },
    userB: { id: 2, gender: 2, birth_year: 1993, city: '广州', baby_plan: '不要孩子', appearance_description: '外向时尚' },
    settingsB: { self_view_text: '我喜欢热闹社交派对', target_view_text: '对方热爱旅行冒险运动' }
  }, { providerName: 'stub' })
  assert.ok(asymmetric.a_to_b.score !== asymmetric.b_to_a.score || asymmetric.a_to_b.top_evidence[0].evidence_key !== asymmetric.b_to_a.top_evidence[0].evidence_key)

  const conflict = await retrieveBidirectional({
    userA: { id: 1, gender: 1, baby_plan: '丁克不要孩子' },
    settingsA: { self_view_text: '稳定', target_view_text: '稳定', like_baby_plan: '不要孩子' },
    userB: { id: 2, gender: 2, baby_plan: '想尽快要孩子' },
    settingsB: { self_view_text: '稳定', target_view_text: '稳定', like_baby_plan: '要孩子' }
  }, { providerName: 'stub' })
  assert.ok(conflict.a_to_b.conflict_signals.some((item) => item.code === 'marriage_and_baby_conflict')
    || conflict.b_to_a.conflict_signals.some((item) => item.code === 'marriage_and_baby_conflict'))
  assert.ok(conflict.mutual_score <= 20, `opposing baby plans must not score highly: ${conflict.mutual_score}`)

  const sparse = await retrieveBidirectional({
    userA: { id: 1, gender: 1 },
    settingsA: { target_view_text: '希望对方踏实' },
    userB: { id: 2, gender: 2 },
    settingsB: {}
  }, { providerName: 'stub' })
  assert.ok(sparse.a_to_b.missing_categories.includes('values_self'))

  await assert.rejects(
    () => retrieveBidirectional(synonymPair, { provider: createEmbeddingProvider({ provider: 'none' }) }),
    /semantic_retrieval_unavailable/
  )
  const previousProvider = process.env.MATCH_EMBEDDING_PROVIDER
  delete process.env.MATCH_EMBEDDING_PROVIDER
  await assert.rejects(() => retrieveBidirectional(synonymPair), /semantic_retrieval_unavailable/)
  const unavailableRerank = await semanticRerank([{
    candidate: synonymPair.userB,
    quality: { pass: true },
    scoreA: { normalizedTotal: 80 },
    scoreB: { normalizedTotal: 80 },
    mutualScore: 80
  }], synonymPair.userA, {
    '1': synonymPair.settingsA,
    '2': synonymPair.settingsB
  })
  // Provider unavailable must NOT abort matching: deterministic fallback with degraded marker
  assert.strictEqual(unavailableRerank.applied, true)
  assert.strictEqual(unavailableRerank.degraded, true)
  assert.strictEqual(unavailableRerank.reason, 'semantic_retrieval_unavailable')
  if (previousProvider === undefined) delete process.env.MATCH_EMBEDDING_PROVIDER
  else process.env.MATCH_EMBEDDING_PROVIDER = previousProvider

  console.log('PASS bidirectional semantic retrieval')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
