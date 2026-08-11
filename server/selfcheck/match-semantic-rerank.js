const assert = require('assert')
const {
  RERANK_VERSION,
  buildSemanticRerankRequest,
  validateSemanticRerankResponse,
  mergeSemanticRerank
} = require('../../miniprogram/cloudfunctions/api/lib/matchSemanticRerank')

const ranked = [
  {
    internalUserId: 31,
    candidate: { id: 31, openid: 'must-not-leak' },
    quality: { pass: true },
    mutualScore: 82,
    viewSimilarity: 88,
    scoreA: { normalizedTotal: 86, maxTotal: 100, dimensions: {} },
    scoreB: { normalizedTotal: 78, maxTotal: 100, dimensions: {} },
    intentA: { values: [{ value: '稳定沟通' }], lifestyle: [{ value: '未来城市规划' }], appearance_preferences: [{ value: '自然' }] },
    intentB: { values: [{ value: '尊重边界' }], lifestyle: [{ value: '共同规划生活' }], appearance_preferences: [{ value: '清爽' }] },
    supplementA: '手机号 13800138000，未来希望在杭州生活',
    supplementB: '不发送联系方式，重视公共场所见面'
  }
]

const request = buildSemanticRerankRequest({ evaluationId: 'offline_eval_20260812', candidates: ranked, topK: 5 })
assert.strictEqual(request.version, RERANK_VERSION)
assert.strictEqual(request.candidates.length, 1)
const serialized = JSON.stringify(request)
assert(!serialized.includes('must-not-leak'))
assert(!serialized.includes('13800138000'))
assert(serialized.includes('稳定沟通'))
assert(serialized.includes('自然'))
assert(serialized.includes('补充需求已脱敏'))

const response = validateSemanticRerankResponse({
  version: RERANK_VERSION,
  ranking: [{
    candidate_ref: 'candidate_1',
    rank: 1,
    a_to_b_semantic_score: 86,
    b_to_a_semantic_score: 73,
    mutual_semantic_score: 79,
    mutual_strengths: ['沟通方式有共同点'],
    asymmetric_risks: [],
    confirmation_questions: ['未来城市安排'],
    evidence_tags: ['life_plan_alignment'],
    data_completeness: 0.8,
    confidence: 0.84
  }],
  request
}, request)
assert.strictEqual(response[0].internalUserId, 31)
assert.strictEqual(response[0].mutualSemanticScore, 79)

const merged = mergeSemanticRerank(ranked, response, { minConfidence: 0.7, maxWeight: 0.2 })
assert.strictEqual(merged.applied, true)
assert.strictEqual(merged.ranked[0].ai_rank, 1)
assert(merged.ranked[0].ai_weight <= 0.2)

const fallback = mergeSemanticRerank(ranked, [{ ...response[0], confidence: 0.2 }], { minConfidence: 0.7 })
assert.strictEqual(fallback.applied, false)
assert.strictEqual(fallback.reason, 'low_confidence')

console.log('PASS strict bilateral semantic rerank privacy and fallback policy')
