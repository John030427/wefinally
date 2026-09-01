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
  console.log('PASS sparse RAG integration preserves hard gates, shadow ordering, and redacted HY3 boundary')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
