const {
  buildSemanticRerankRequest,
  validateSemanticRerankResponse,
  mergeSemanticRerank,
  normalizedMutualScore
} = require('./matchSemanticRerank')
const { rerankMutualMatchCandidates } = require('./deepseek')
const { compileIntentProfile } = require('./intentProfile')
const { retrieveBidirectional } = require('./matchSemanticRetrieval')
const { createEmbeddingProvider } = require('./embeddingProvider')
const { computeFinalMatchScore } = require('./matchFinalScore')
const { scoreBilateralProfiles } = require('./bilateralNeedsMatch')

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (err) { return null }
}

function aiProfileOf(setting) {
  return parseJson(setting && setting.ai_match_profile_json)
}

function intentFor(user, setting) {
  return parseJson(setting && setting.intent_profile_json) || compileIntentProfile(Object.assign({}, user || {}, setting || {}, {
    mode: 'automatic'
  }))
}

function classifySemanticRerankError(error) {
  const message = String(error && error.message || '').toLowerCase()
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout'
  if (message.includes('429') || message.includes('rate limit')) return 'rate_limited'
  if (message.includes('401') || message.includes('403') || message.includes('api key')) return 'provider_auth'
  if (message.includes('json invalid')) return 'invalid_json'
  if (message.includes('semantic_retrieval_unavailable')) return 'semantic_retrieval_unavailable'
  if (message.includes('响应') || message.includes('候选') || message.includes('隐私') || message.includes('无效') || message.includes('evidence_key')) {
    return 'invalid_response'
  }
  return 'provider_error'
}

function allowedKeysFromRetrieval(retrieval) {
  const keys = []
  for (const side of [retrieval && retrieval.a_to_b, retrieval && retrieval.b_to_a]) {
    for (const hit of (side && side.top_evidence) || []) {
      if (hit && hit.evidence_key) keys.push(hit.evidence_key)
      if (hit && hit.query_evidence_key) keys.push(hit.query_evidence_key)
    }
  }
  return [...new Set(keys)]
}

async function attachRetrieval(eligible, user, settingsByUserId) {
  const providerName = process.env.MATCH_EMBEDDING_PROVIDER || 'none'
  const provider = createEmbeddingProvider({ provider: providerName })
  if (provider.name === 'none') {
    const error = new Error('semantic_retrieval_unavailable')
    error.code = 'semantic_retrieval_unavailable'
    throw error
  }
  const enriched = []
  for (const item of eligible.slice(0, 10)) {
    try {
      const partnerSetting = settingsByUserId[String(item.candidate.id)] || {}
      const currentSetting = settingsByUserId[String(user.id)] || {}
      const retrieval = await retrieveBidirectional({
        userA: user,
        settingsA: currentSetting,
        userB: item.candidate,
        settingsB: partnerSetting
      }, { provider })
      enriched.push(Object.assign({}, item, {
        retrieval,
        allowedEvidenceKeys: allowedKeysFromRetrieval(retrieval)
      }))
    } catch (err) {
      throw err
    }
  }
  return enriched
}

/**
 * Deterministic bilateral AI Match Profile fit (A→B / B→A / min-sensitive mutual).
 * Never throws; missing profiles simply leave bilateral_fit absent so the
 * final-score blend falls back to the other components.
 */
function attachBilateralFit(ranked, user, settingsByUserId) {
  const viewer = aiProfileOf(settingsByUserId[String(user && user.id)])
  if (!viewer) return (Array.isArray(ranked) ? ranked : []).slice()
  return (Array.isArray(ranked) ? ranked : []).map((item) => {
    if (!item || !item.candidate) return item
    const partner = aiProfileOf(settingsByUserId[String(item.candidate.id)])
    if (!partner) return item
    const bilateral = scoreBilateralProfiles(viewer, partner)
    if (bilateral.mutual_score == null) return item
    return Object.assign({}, item, {
      bilateral_fit: {
        mutual_score: Number(bilateral.mutual_score),
        a_to_b: Number(bilateral.a_to_b && bilateral.a_to_b.score || 0),
        b_to_a: Number(bilateral.b_to_a && bilateral.b_to_a.score || 0),
        asymmetric: Boolean(bilateral.asymmetric),
        aggregation: bilateral.aggregation || 'min_sensitive_harmonic',
        compared: true
      }
    })
  })
}

function withFinalScores(ranked) {
  const scored = (Array.isArray(ranked) ? ranked : []).map((item, originalIndex) => {
    const structured = normalizedMutualScore(item)
    const completeness = Math.round((
      Number(item.scoreA && item.scoreA.completeness || 0)
      + Number(item.scoreB && item.scoreB.completeness || 0)
    ) / 2)
    const finalScore = computeFinalMatchScore({
      structured_fit: structured,
      bilateral_fit: item.bilateral_fit ? item.bilateral_fit.mutual_score : undefined,
      retrieval_mutual: item.retrieval && item.retrieval.mutual_score,
      prompt_mutual: item.mutual_semantic_score,
      completeness,
      confidence: item.semantic_confidence
    })
    return Object.assign({}, item, {
      final_score: finalScore,
      final_match_score: finalScore.final_match_score,
      canonical_score: finalScore.canonical_score,
      canonical_original_index: originalIndex
    })
  })
  scored.sort((left, right) => Number(right.canonical_score || 0) - Number(left.canonical_score || 0)
    || Number(left.canonical_original_index || 0) - Number(right.canonical_original_index || 0))
  return scored.map((item) => {
    const copy = Object.assign({}, item)
    delete copy.canonical_original_index
    return copy
  })
}

function degradedResult(reason, ranked, model) {
  return {
    applied: true,
    degraded: true,
    reason: reason || 'fallback_deterministic',
    model: model || '',
    ranked: withFinalScores(ranked)
  }
}

async function semanticRerank(ranked, user, settingsByUserId) {
  const eligible = ranked.filter((item) => item.quality && item.quality.pass === true)
  if (!eligible.length) return { applied: false, reason: 'no_candidates', ranked: withFinalScores(ranked) }
  const withBilateral = attachBilateralFit(ranked, user, settingsByUserId)
  try {
    const withRetrieval = await attachRetrieval(eligible, user, settingsByUserId)
    const byId = new Map(withRetrieval.map((item) => [String(item.candidate.id), item]))
    const rankedWithRetrieval = withBilateral.map((item) => byId.get(String(item.candidate.id)) || item)

    const currentSetting = settingsByUserId[String(user.id)] || {}
    const request = buildSemanticRerankRequest({
      topK: 10,
      candidates: withRetrieval.map((item) => {
        const partnerSetting = settingsByUserId[String(item.candidate.id)] || {}
        return {
          internalUserId: item.candidate.id,
          quality: item.quality,
          mutualScore: item.mutualScore,
          viewSimilarity: item.viewSimilarity,
          scoreA: item.scoreA,
          scoreB: item.scoreB,
          retrieval: item.retrieval,
          allowedEvidenceKeys: item.allowedEvidenceKeys,
          intentA: intentFor(user, currentSetting),
          intentB: intentFor(item.candidate, partnerSetting),
          supplementA: currentSetting.other_requirements,
          supplementB: partnerSetting.other_requirements
        }
      })
    })
    const remote = await rerankMutualMatchCandidates(request)
    if (!remote || !remote.enabled || !remote.response) {
      return degradedResult('disabled', rankedWithRetrieval, '')
    }
    const validated = validateSemanticRerankResponse(remote.response, request)
    const merged = mergeSemanticRerank(rankedWithRetrieval, validated, { minConfidence: 0.65, maxWeight: 0.2 })
    if (!merged.applied) {
      return degradedResult(merged.reason || 'low_confidence', merged.ranked, remote.model || '')
    }
    return Object.assign({}, merged, {
      degraded: false,
      reason: '',
      model: remote.model || '',
      ranked: withFinalScores(merged.ranked)
    })
  } catch (err) {
    return degradedResult(classifySemanticRerankError(err), withBilateral)
  }
}

function intentMatchGate(setting) {
  const profile = parseJson(setting && setting.intent_profile_json)
  if (!profile || !profile.mode) return null
  if (profile.mode === 'confirm' && !setting.intent_profile_confirmed_at) {
    return { code: 409, message: '请先确认 AI 对你的理解后再开始匹配', clarification_questions: profile.clarification_questions || [] }
  }
  if (Array.isArray(profile.contradictions) && profile.contradictions.length) {
    return { code: 409, message: '你的匹配补充存在需要先厘清的矛盾，请修改后再试', clarification_questions: profile.clarification_questions || [] }
  }
  return null
}

module.exports = {
  semanticRerank,
  intentMatchGate,
  classifySemanticRerankError,
  withFinalScores,
  attachBilateralFit,
  aiProfileOf
}
