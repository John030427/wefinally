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
    retrieval: { a_to_b: { score: 77 }, b_to_a: { score: 72 }, mutual_score: 74 },
    allowedEvidenceKeys: ['values_self:abc', 'values_target:def'],
    intentA: { must_have: ['真诚'], profile_confidence: 0.8 },
    intentB: { must_have: ['稳重'], profile_confidence: 0.7 }
  }]
})
assert.strictEqual(request.candidates[0].allowed_evidence_keys.length, 2)
assert.strictEqual(request.constraints.reject_unknown_evidence_key, true)

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

console.log('PASS final score and evidence-key constrained rerank')
