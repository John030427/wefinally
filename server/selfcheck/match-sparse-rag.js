const assert = require('assert')
const {
  RETRIEVAL_VERSION,
  TOP_K,
  tokenizeSparse,
  scoreBm25,
  retrieveSparseBidirectional
} = require('../../miniprogram/cloudfunctions/api/lib/sparseMatchRetrieval')
const {
  resolveRagMode,
  applyRagMode
} = require('../../miniprogram/cloudfunctions/api/lib/matchRagRuntime')

function corpusDocument(ownerUserId, evidenceKey, category, sanitizedText) {
  return {
    owner_user_id: ownerUserId,
    evidence_key: evidenceKey,
    category,
    sanitized_text: sanitizedText,
    tokens: tokenizeSparse(sanitizedText),
    enabled: true,
    retrieval_version: RETRIEVAL_VERSION
  }
}

async function main() {
  // Character unigrams/bigrams and the existing bounded synonym expansion are
  // the observable sparse contract; no embedding/vector representation exists.
  const tokens = tokenizeSparse('  我重视踏实和担当，愿意沟通。 ')
  assert.ok(tokens.includes('踏'), 'sparse tokenizer keeps character unigrams')
  assert.ok(tokens.includes('踏实'), 'sparse tokenizer keeps character bigrams')
  assert.ok(tokens.includes('稳重'), 'sparse tokenizer expands the existing synonym group')
  assert.ok(tokens.includes('担当'), 'sparse tokenizer preserves explicit terms')
  assert.ok(tokens.length <= 1200, 'sparse tokenizer is bounded')
  assert.deepStrictEqual(tokenizeSparse(''), [])
  assert.deepStrictEqual(tokenizeSparse(null), [])

  const scored = scoreBm25(tokenizeSparse('希望对方稳重可靠'), [
    corpusDocument(2, 'values_self:strong', 'values_self', '我为人稳重可靠，做事踏实'),
    corpusDocument(2, 'values_self:weak', 'values_self', '我喜欢热闹社交派对')
  ])
  assert.strictEqual(scored.length, 2)
  assert.strictEqual(scored[0].document.evidence_key, 'values_self:strong')
  assert.ok(scored[0].score > scored[1].score)
  assert.ok(scored.every((item) => !Object.prototype.hasOwnProperty.call(item, 'vector')))

  assert.strictEqual(resolveRagMode({ MATCH_RAG_MODE: 'off' }), 'off')
  assert.strictEqual(resolveRagMode({ MATCH_RAG_MODE: 'SHADOW' }), 'shadow')
  assert.strictEqual(resolveRagMode({ MATCH_RAG_MODE: ' Active ' }), 'active')
  assert.strictEqual(resolveRagMode({ MATCH_RAG_MODE: 'unexpected' }), 'off')
  assert.strictEqual(resolveRagMode({}), 'off')

  const pair = {
    userA: { id: 1, gender: 1, city: '广州', baby_plan: '3-5年内', appearance_description: '清爽' },
    settingsA: {
      self_view_text: '我重视踏实和担当',
      target_view_text: '希望对方稳重可靠',
      other_requirements: '愿意沟通'
    },
    userB: { id: 2, gender: 2, city: '广州', baby_plan: '3-5年内', appearance_description: '自然' },
    settingsB: {
      self_view_text: '我为人稳重可靠，做事踏实',
      target_view_text: '希望对方热爱旅行冒险运动'
    }
  }
  const corpusByUserId = {
    '1': [
      corpusDocument(1, 'values_self:a', 'values_self', '我重视踏实和担当'),
      corpusDocument(1, 'marriage_and_baby:a', 'marriage_and_baby', '3-5年内'),
      corpusDocument(1, 'city_plan:a', 'city_plan', '广州')
    ],
    '2': [
      corpusDocument(2, 'values_self:b', 'values_self', '我为人稳重可靠，做事踏实'),
      corpusDocument(2, 'marriage_and_baby:b', 'marriage_and_baby', '3-5年内'),
      corpusDocument(2, 'city_plan:b', 'city_plan', '广州')
    ]
  }
  const result = await retrieveSparseBidirectional(pair, corpusByUserId)
  assert.strictEqual(result.retrieval_version, 'sparse_bm25_v1')
  assert.strictEqual(result.top_k, TOP_K)
  assert.ok(result.a_to_b.top_evidence.length >= 1)
  assert.ok(result.a_to_b.top_evidence[0].evidence_key.startsWith('values_self:'))
  assert.notStrictEqual(result.a_to_b.score, result.b_to_a.score)
  assert.ok(!JSON.stringify(result).includes('vector'))

  const conflict = await retrieveSparseBidirectional({
    userA: { id: 1, gender: 1, baby_plan: '丁克不要孩子' },
    settingsA: { target_view_text: '希望对方不要孩子' },
    userB: { id: 2, gender: 2, baby_plan: '想尽快要孩子' },
    settingsB: { target_view_text: '希望对方要孩子' }
  }, {
    '1': [
      corpusDocument(1, 'marriage_and_baby:a', 'marriage_and_baby', '丁克不要孩子')
    ],
    '2': [
      corpusDocument(2, 'marriage_and_baby:b', 'marriage_and_baby', '想尽快要孩子')
    ]
  })
  assert.ok(conflict.a_to_b.conflict_signals.some((item) => item.code === 'marriage_and_baby_conflict'))
  assert.ok(conflict.a_to_b.score <= 20)

  const insufficient = await retrieveSparseBidirectional({
    userA: { id: 1, gender: 1 },
    settingsA: { target_view_text: '希望对方踏实' },
    userB: { id: 2, gender: 2 },
    settingsB: {}
  }, { '1': [], '2': [] })
  assert.strictEqual(insufficient.reason, 'sparse_retrieval_insufficient')
  assert.strictEqual(insufficient.a_to_b.reason, 'sparse_retrieval_insufficient')
  assert.strictEqual(insufficient.a_to_b.score, 0)
  assert.deepStrictEqual(insufficient.a_to_b.top_evidence, [])

  const original = [
    { candidate: { id: 2 }, canonical_score: 80 },
    { candidate: { id: 3 }, canonical_score: 70 }
  ]
  const enriched = [
    { candidate: { id: 3 }, canonical_score: 95 },
    { candidate: { id: 2 }, canonical_score: 60 }
  ]
  assert.deepStrictEqual(applyRagMode('shadow', original, enriched).map((x) => x.candidate.id), [2, 3])
  assert.deepStrictEqual(applyRagMode('active', original, enriched).map((x) => x.candidate.id), [3, 2])
  assert.deepStrictEqual(applyRagMode('unexpected', original, enriched).map((x) => x.candidate.id), [2, 3])

  console.log('PASS sparse bidirectional retrieval and strict RAG modes')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
