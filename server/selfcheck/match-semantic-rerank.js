const assert = require('assert')
const {
  RERANK_VERSION,
  buildSemanticRerankRequest,
  validateSemanticRerankResponse,
  mergeSemanticRerank
} = require('../../miniprogram/cloudfunctions/api/lib/matchSemanticRerank')
const {
  classifySemanticRerankError,
  safeProviderErrorCode
} = require('../../miniprogram/cloudfunctions/api/lib/semanticMatchService')

assert.strictEqual(classifySemanticRerankError(new Error('DeepSeek match rerank JSON invalid')), 'invalid_json')
assert.strictEqual(classifySemanticRerankError(new Error('request timeout')), 'timeout')
assert.strictEqual(classifySemanticRerankError(new Error('HTTP 429')), 'rate_limited')
assert.strictEqual(classifySemanticRerankError(new Error('secret internal upstream detail')), 'provider_error')
assert.strictEqual(safeProviderErrorCode({ code: 'provider_request_error' }), 'provider_request_error')
assert.strictEqual(safeProviderErrorCode({ code: 'InvalidParameter.ResponseFormat' }), 'invalidparameter.responseformat')
assert.strictEqual(safeProviderErrorCode({ code: 'token-secret-value' }), 'redacted')
assert.strictEqual(safeProviderErrorCode({ code: 'unsafe value with spaces' }), 'unknown')

const ranked = [
  {
    candidate: { id: 31, openid: 'must-not-leak' },
    quality: { pass: true },
    mutualScore: 82,
    viewSimilarity: 88,
    scoreA: { normalizedTotal: 86, maxTotal: 100, dimensions: {} },
    scoreB: { normalizedTotal: 78, maxTotal: 100, dimensions: {} },
    intentA: {
      must_have: [{ value: '未来必须在杭州生活' }],
      preferences: [{ value: '喜欢安静生活' }],
      values: [{ value: '稳定沟通' }],
      lifestyle: [{ value: '未来城市规划' }],
      appearance_preferences: [{ value: '自然' }],
      deal_breakers: [{ value: '不接受长期异地' }],
      contradictions: [{ value: '城市计划待确认' }],
      evidence: [{ excerpt: '微信号 test_user，未来希望在杭州生活' }]
    },
    intentB: { values: [{ value: '尊重边界' }], lifestyle: [{ value: '共同规划生活' }], appearance_preferences: [{ value: '清爽' }] },
    supplementA: '手机号 13800138000，未来希望在杭州生活',
    supplementB: '不发送联系方式，重视公共场所见面',
    allowedEvidenceKeys: ['values_self:candidate31']
  },
  {
    candidate: { id: 32, openid: 'also-must-not-leak' },
    quality: { pass: true },
    mutualScore: 81,
    viewSimilarity: 84,
    scoreA: { normalizedTotal: 83, maxTotal: 100, dimensions: {} },
    scoreB: { normalizedTotal: 79, maxTotal: 100, dimensions: {} },
    intentA: { values: [{ value: '稳定沟通' }], lifestyle: [], appearance_preferences: [] },
    intentB: { values: [{ value: '坦诚交流' }], lifestyle: [], appearance_preferences: [] },
    allowedEvidenceKeys: ['values_self:candidate32']
  }
]

const request = buildSemanticRerankRequest({
  evaluationId: 'offline_eval_20260812',
  candidates: ranked.map((item) => ({ ...item, internalUserId: item.candidate.id })),
  topK: 5
})
assert.strictEqual(request.version, RERANK_VERSION)
assert.strictEqual(request.candidates.length, 2)
const serialized = JSON.stringify(request)
assert(!serialized.includes('must-not-leak'))
assert(!serialized.includes('13800138000'))
assert(!serialized.includes('test_user'))
assert(serialized.includes('稳定沟通'))
assert(serialized.includes('自然'))
assert(serialized.includes('未来希望在杭州生活'))
assert(serialized.includes('不发送联系方式'))
assert(serialized.includes('未来必须在杭州生活'))
assert(serialized.includes('不接受长期异地'))
assert(serialized.includes('城市计划待确认'))
assert(serialized.includes('[已脱敏]'))

const normalizedRequest = buildSemanticRerankRequest({
  candidates: [{
    candidate: { id: 99 },
    internalUserId: 99,
    quality: { pass: true },
    mutualScore: 120,
    viewSimilarity: 90,
    scoreA: { normalizedTotal: 80 },
    scoreB: { normalizedTotal: 70 },
    intentA: {},
    intentB: {}
  }]
})
assert.strictEqual(normalizedRequest.candidates[0].mutual_score_percent, 75)

const response = validateSemanticRerankResponse({
  version: RERANK_VERSION,
  ranking: [{
    candidate_ref: 'candidate_1',
    rank: 2,
    a_to_b_semantic_score: 86,
    b_to_a_semantic_score: 73,
    mutual_semantic_score: 79,
    mutual_strengths: ['沟通方式有共同点'],
    asymmetric_risks: [],
    confirmation_questions: ['未来城市安排'],
    evidence_tags: ['life_plan_alignment'],
    strength_evidence_keys: ['values_self:candidate31'],
    risk_evidence_keys: [],
    missing_categories: [],
    data_completeness: 0.8,
    confidence: 0.84
  }, {
    candidate_ref: 'candidate_2',
    rank: 1,
    a_to_b_semantic_score: 94,
    b_to_a_semantic_score: 91,
    mutual_semantic_score: 93,
    mutual_strengths: ['沟通节奏一致'],
    asymmetric_risks: [],
    confirmation_questions: [],
    evidence_tags: ['bilateral_score'],
    strength_evidence_keys: ['values_self:candidate32'],
    risk_evidence_keys: [],
    missing_categories: [],
    data_completeness: 0.86,
    confidence: 0.88
  }],
  request
}, request)
assert.strictEqual(response[0].internalUserId, 32)
assert.strictEqual(response[0].mutualSemanticScore, 93)
assert.strictEqual(response[1].internalUserId, 31)
assert.strictEqual(response[1].mutualSemanticScore, 79)

const tolerantResponse = validateSemanticRerankResponse({
  version: RERANK_VERSION,
  ranking: [{
    candidate_ref: 'candidate_1',
    rank: 1,
    a_to_b_semantic_score: 86,
    b_to_a_semantic_score: 73,
    mutual_semantic_score: 79,
    mutual_strengths: [],
    asymmetric_risks: [],
    confirmation_questions: [],
    evidence_tags: ['life_plan_alignment', 'model_explanation'],
    data_completeness: 80,
    confidence: 84
  }, {
    candidate_ref: 'candidate_2',
    rank: 2,
    a_to_b_semantic_score: 82,
    b_to_a_semantic_score: 81,
    mutual_semantic_score: 81,
    mutual_strengths: [],
    asymmetric_risks: [],
    confirmation_questions: [],
    evidence_tags: ['bilateral_score'],
    data_completeness: 0.8,
    confidence: 0.84
  }]
}, request)
assert.strictEqual(tolerantResponse[0].dataCompleteness, 0.8)
assert.strictEqual(tolerantResponse[0].confidence, 0.84)
assert.deepStrictEqual(tolerantResponse[0].evidenceTags, ['life_plan_alignment'])
assert.throws(() => validateSemanticRerankResponse({
  version: RERANK_VERSION,
  ranking: [{
    candidate_ref: 'candidate_1',
    rank: 1,
    a_to_b_semantic_score: 86,
    b_to_a_semantic_score: 73,
    mutual_semantic_score: 79,
    mutual_strengths: ['手机号 13800138000'],
    asymmetric_risks: [],
    confirmation_questions: [],
    evidence_tags: ['life_plan_alignment'],
    data_completeness: 0.8,
    confidence: 0.84
  }, {
    candidate_ref: 'candidate_2',
    rank: 2,
    a_to_b_semantic_score: 82,
    b_to_a_semantic_score: 81,
    mutual_semantic_score: 81,
    mutual_strengths: [],
    asymmetric_risks: [],
    confirmation_questions: [],
    evidence_tags: ['bilateral_score'],
    data_completeness: 0.8,
    confidence: 0.84
  }],
  request
}, request), /隐私信息/)

const merged = mergeSemanticRerank(ranked, response, { minConfidence: 0.7, maxWeight: 0.2 })
assert.strictEqual(merged.applied, true)
assert.strictEqual(merged.ranked[0].candidate.id, 32)
assert.strictEqual(merged.ranked[0].ai_rank, 1)
assert.strictEqual(merged.ranked[1].candidate.id, 31)
assert.strictEqual(merged.ranked[1].ai_rank, 2)
assert(merged.ranked[0].ai_weight <= 0.2)
assert(merged.ranked.every((item) => item.semantic_score >= 0 && item.semantic_score <= 100))

const fallback = mergeSemanticRerank(ranked, [{ ...response[0], confidence: 0.2 }], { minConfidence: 0.7 })
assert.strictEqual(fallback.applied, false)
assert.strictEqual(fallback.reason, 'low_confidence')

console.log('PASS strict bilateral semantic rerank privacy and fallback policy')
