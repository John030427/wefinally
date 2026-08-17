const FINAL_SCORE_VERSION = 'final_score_v1'

// ponytail: weights not calibrated against real date outcomes yet.
const FINAL_SCORE_WEIGHTS = Object.freeze({
  structured_fit: 0.55,
  retrieval_mutual: 0.25,
  prompt_mutual: 0.2
})

function clamp(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, Math.round(number)))
}

function computeFinalMatchScore(input = {}) {
  const structured = clamp(input.structured_fit)
  const retrieval = clamp(input.retrieval_mutual)
  const prompt = clamp(input.prompt_mutual)
  const completeness = clamp(input.completeness)
  const confidence = Number.isFinite(Number(input.confidence))
    ? Math.max(0, Math.min(1, Number(input.confidence)))
    : null

  let weightSum = 0
  let total = 0
  if (structured != null) {
    total += structured * FINAL_SCORE_WEIGHTS.structured_fit
    weightSum += FINAL_SCORE_WEIGHTS.structured_fit
  }
  if (retrieval != null) {
    total += retrieval * FINAL_SCORE_WEIGHTS.retrieval_mutual
    weightSum += FINAL_SCORE_WEIGHTS.retrieval_mutual
  }
  if (prompt != null && confidence != null && confidence >= 0.65) {
    total += prompt * FINAL_SCORE_WEIGHTS.prompt_mutual
    weightSum += FINAL_SCORE_WEIGHTS.prompt_mutual
  }
  const finalScore = weightSum ? clamp(total / weightSum) : structured
  return {
    version: FINAL_SCORE_VERSION,
    weights: FINAL_SCORE_WEIGHTS,
    calibrated: false,
    structured_fit: structured,
    retrieval_mutual: retrieval,
    prompt_mutual: prompt,
    completeness,
    confidence,
    final_match_score: finalScore,
    canonical_score: finalScore
  }
}

module.exports = {
  FINAL_SCORE_VERSION,
  FINAL_SCORE_WEIGHTS,
  computeFinalMatchScore
}
