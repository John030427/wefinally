const assert = require('assert')
const {
  computeFinalMatchScore,
  FINAL_SCORE_VERSION,
  FINAL_SCORE_WEIGHTS
} = require('../../miniprogram/cloudfunctions/api/lib/matchFinalScore')
const {
  buildSemanticRerankRequest,
  validateSemanticRerankResponse
} = require('../../miniprogram/cloudfunctions/api/lib/matchSemanticRerank')
const { withFinalScores } = require('../../miniprogram/cloudfunctions/api/lib/semanticMatchService')

assert.strictEqual(FINAL_SCORE_VERSION, 'final_score_v1')
assert.strictEqual(FINAL_SCORE_WEIGHTS.calibrated, undefined)

const scored = computeFinalMatchScore({
  structured_fit: 90,
  retrieval_mutual: 80,
  prompt_mutual: 70,
  completeness: 85,
  confidence: 0.8
})
assert.strictEqual(scored.final_match_score, scored.canonical_score)
assert.strictEqual(scored.calibrated, false)
assert.ok(scored.final_match_score >= 70 && scored.final_match_score <= 90)

const lowConfidence = computeFinalMatchScore({
  structured_fit: 90,
  retrieval_mutual: 80,
  prompt_mutual: 10,
  confidence: 0.2
})
assert.ok(lowConfidence.final_match_score > 80)

const request = buildSemanticRerankRequest({
  topK: 1,
  candidates: [{
    internalUserId: 9,
    quality: { pass: true },
    mutualScore: 88,
    viewSimilarity: 70,
    scoreA: { normalizedTotal: 90 },
    scoreB: { normalizedTotal: 86 },
    retrieval: {
      a_to_b: {
        score: 77,
        top_evidence: [{
          evidence_key: 'values_self:abc',
          query_evidence_key: 'values_target:def',
          category: 'values_self',
          query_category: 'values_target',
          score: 77,
          evidence_text: '重视真诚和长期关系',
          query_evidence_text: '希望对方真诚'
        }],
        conflict_signals: [],
        missing_categories: ['appearance_self']
      },
      b_to_a: { score: 72, top_evidence: [], conflict_signals: [], missing_categories: [] },
      mutual_score: 74
    },
    allowedEvidenceKeys: ['values_self:abc', 'values_target:def'],
    intentA: { must_have: ['真诚'], profile_confidence: 0.8 },
    intentB: { must_have: ['稳重'], profile_confidence: 0.7 }
  }]
})
assert.strictEqual(request.candidates[0].allowed_evidence_keys.length, 2)
assert.strictEqual(request.constraints.reject_unknown_evidence_key, true)
assert.strictEqual(request.candidates[0].retrieved_evidence.a_to_b[0].evidence_text, '重视真诚和长期关系')
assert.deepStrictEqual(request.candidates[0].missing_categories.a_to_b, ['appearance_self'])

assert.throws(() => validateSemanticRerankResponse({
  version: request.version,
  ranking: [{
    candidate_ref: 'candidate_1',
    rank: 1,
    a_to_b_semantic_score: 80,
    b_to_a_semantic_score: 78,
    mutual_semantic_score: 79,
    mutual_strengths: ['价值观接近'],
    asymmetric_risks: [],
    confirmation_questions: [],
    evidence_tags: ['life_plan_alignment'],
    strength_evidence_keys: ['values_self:not-allowed'],
    risk_evidence_keys: [],
    data_completeness: 0.8,
    confidence: 0.9
  }]
}, request), /evidence_key/)

const finalRanked = withFinalScores([{
  candidate: { id: 1 },
  scoreA: { normalizedTotal: 95, completeness: 100 },
  scoreB: { normalizedTotal: 40, completeness: 100 },
  retrieval: { mutual_score: 50 },
  mutual_semantic_score: 50,
  semantic_confidence: 0.9
}, {
  candidate: { id: 2 },
  scoreA: { normalizedTotal: 80, completeness: 100 },
  scoreB: { normalizedTotal: 80, completeness: 100 },
  retrieval: { mutual_score: 90 },
  mutual_semantic_score: 90,
  semantic_confidence: 0.9
}])
assert.strictEqual(finalRanked[0].candidate.id, 2)
assert.ok(finalRanked[0].canonical_score > finalRanked[1].canonical_score)
assert.strictEqual(finalRanked[1].final_score.structured_fit, 56)

console.log('PASS final score and evidence-key constrained rerank')
