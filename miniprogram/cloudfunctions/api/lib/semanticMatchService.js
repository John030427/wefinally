const {
  buildSemanticRerankRequest,
  validateSemanticRerankResponse,
  mergeSemanticRerank,
  normalizedMutualScore
} = require('./matchSemanticRerank')
const deepseek = require('./deepseek')
const {
  retrieveSparseBidirectional,
  RETRIEVAL_VERSION
} = require('./sparseMatchRetrieval')
const { CHUNK_VERSION } = require('./matchRagCorpus')
const { CHUNK_CATEGORIES } = require('./matchEvidenceChunks')
const { resolveRagMode, applyRagMode } = require('./matchRagRuntime')
const { computeFinalMatchScore } = require('./matchFinalScore')
const { scoreBilateralProfiles } = require('./bilateralNeedsMatch')

const RAG_PROVIDER = 'cloudbase'
const RAG_MODEL = 'hy3'
const SAFE_EVIDENCE_KEY = /^[a-z][a-z0-9_]*:[a-f0-9]{16,64}$/i
const BOUNDED_REASONS = new Set([
  '',
  'no_candidates',
  'disabled',
  'timeout',
  'rate_limited',
  'provider_auth',
  'invalid_json',
  'invalid_response',
  'semantic_retrieval_unavailable',
  'sparse_retrieval_insufficient',
  'corpus_unavailable',
  'corpus_invalid',
  'provider_config_invalid',
  'provider_error',
  'fallback_deterministic',
  'low_confidence'
])

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (err) { return null }
}
function aiProfileOf(setting) {
  return parseJson(setting && setting.ai_match_profile_json)
}

function classifySemanticRerankError(error) {
  const message = String(error && error.message || '').toLowerCase()
  const code = String(error && (error.code || error.class) || '').toLowerCase()
  if (code === 'etimedout' || code.includes('timeout')) return 'timeout'
  if (code === '429' || code.includes('rate_limit')) return 'rate_limited'
  if (code.includes('invalid_json')) return 'invalid_json'
  if (code.includes('corpus') && (code.includes('invalid') || code.includes('schema'))) return 'corpus_invalid'
  if (code.includes('corpus') || code.includes('repository')) return 'corpus_unavailable'
  if (message.includes('corpus') || message.includes('语料')) {
    return message.includes('invalid') || message.includes('无效') || message.includes('schema')
      ? 'corpus_invalid'
      : 'corpus_unavailable'
  }
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout'
  if (message.includes('429') || message.includes('rate limit')) return 'rate_limited'
  if (message.includes('401') || message.includes('403') || message.includes('api key')) return 'provider_auth'
  if (message.includes('json invalid') || message.includes('invalid json')
    || message.includes('json parse') || message.includes('parse json')) return 'invalid_json'
  if (message.includes('sparse_retrieval_insufficient')) return 'sparse_retrieval_insufficient'
  if (message.includes('semantic_retrieval_unavailable')) return 'semantic_retrieval_unavailable'
  if (message.includes('响应') || message.includes('候选') || message.includes('隐私') || message.includes('无效') || message.includes('evidence_key')) {
    return 'invalid_response'
  }
  return 'provider_error'
}

function boundedReason(value) {
  const reason = String(value || '')
  return BOUNDED_REASONS.has(reason) ? reason : 'fallback_deterministic'
}

function safeRuntimeValue(value, maxLength) {
  const text = String(value || '').trim()
  if (!text || text.length > maxLength || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) return ''
  if (/(?:secret|token|password|prompt|response|openid|phone|mobile|api[_-]?key)/i.test(text)) return ''
  return text
}

function safeRagProvider(value) {
  const provider = safeRuntimeValue(value, 40).toLowerCase()
  return provider === RAG_PROVIDER ? RAG_PROVIDER : ''
}

function safeRagModel(value) {
  const model = safeRuntimeValue(value, 80).toLowerCase()
  return model === RAG_MODEL ? RAG_MODEL : ''
}

function ragProviderConfig(env = process.env) {
  const source = env && typeof env === 'object' ? env : {}
  const provider = String(source.AI_PROVIDER === undefined ? RAG_PROVIDER : source.AI_PROVIDER)
    .trim().toLowerCase()
  const model = String(
    source.DEEPSEEK_MATCH_RERANK_MODEL
      || source.AI_MODEL
      || source.LLM_MODEL
      || RAG_MODEL
  ).trim().toLowerCase()
  const group = String(source.AI_GROUP || RAG_PROVIDER).trim().toLowerCase()
  const configuredRagModel = String(source.MATCH_RAG_MODEL || '').trim().toLowerCase()
  return {
    provider,
    model,
    group,
    valid: provider === RAG_PROVIDER
      && model === RAG_MODEL
      && group === RAG_PROVIDER
      && (!configuredRagModel || configuredRagModel === RAG_MODEL)
  }
}

function ragMetadata(mode, input = {}) {
  const resolvedMode = resolveRagMode({ MATCH_RAG_MODE: mode })
  const isRagMode = resolvedMode === 'shadow' || resolvedMode === 'active'
  const provider = isRagMode ? safeRagProvider(input.provider) : ''
  const model = isRagMode ? safeRagModel(input.model) : ''
  return {
    rag_mode: resolvedMode,
    retrieval_version: isRagMode ? RETRIEVAL_VERSION : '',
    corpus_version: isRagMode ? CHUNK_VERSION : '',
    shadow: resolvedMode === 'shadow',
    provider: provider.slice(0, 40),
    model: model.slice(0, 80),
    reason: boundedReason(input.reason)
  }
}

function resultWithMetadata(ranked, mode, input = {}) {
  const rag = ragMetadata(mode, input)
  return {
    applied: true,
    degraded: input.degraded === true,
    reason: rag.reason,
    model: rag.model,
    provider: rag.provider,
    rag,
    rag_metadata: Object.assign({}, rag),
    ranked: Array.isArray(ranked) ? ranked : []
  }
}

function retrievalEvidenceKey(value) {
  const key = String(value || '').trim()
  return SAFE_EVIDENCE_KEY.test(key) ? key : ''
}

function retrievalCategory(value) {
  const category = String(value || '').trim()
  return CHUNK_CATEGORIES.includes(category) ? category : ''
}

function boundedScore(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0
}

function redactedEvidenceHit(hit) {
  const evidenceKey = retrievalEvidenceKey(hit && hit.evidence_key)
  const queryEvidenceKey = retrievalEvidenceKey(hit && hit.query_evidence_key)
  const category = retrievalCategory(hit && hit.category)
  const queryCategory = retrievalCategory(hit && hit.query_category)
  if (!evidenceKey || !queryEvidenceKey || !category || !queryCategory) return null
  return {
    evidence_key: evidenceKey,
    category,
    score: boundedScore(hit.score),
    query_evidence_key: queryEvidenceKey,
    query_category: queryCategory
  }
}

function redactedConflictSignal(signal, allowedKeys) {
  const code = String(signal && signal.code || '').trim().slice(0, 60)
  const keys = (Array.isArray(signal && signal.evidence_keys) ? signal.evidence_keys : [])
    .map(retrievalEvidenceKey)
    .filter((key) => key && allowedKeys.has(key))
  return code && keys.length ? { code, evidence_keys: [...new Set(keys)] } : null
}

function redactedRetrievalSide(side) {
  const topEvidence = (Array.isArray(side && side.top_evidence) ? side.top_evidence : [])
    .map(redactedEvidenceHit)
    .filter(Boolean)
    .slice(0, 3)
  const allowedKeys = new Set()
  topEvidence.forEach((item) => {
    allowedKeys.add(item.evidence_key)
    allowedKeys.add(item.query_evidence_key)
  })
  const conflictSignals = (Array.isArray(side && side.conflict_signals) ? side.conflict_signals : [])
    .map((item) => redactedConflictSignal(item, allowedKeys))
    .filter(Boolean)
    .slice(0, 6)
  return {
    score: boundedScore(side && side.score),
    top_evidence: topEvidence,
    missing_categories: (Array.isArray(side && side.missing_categories) ? side.missing_categories : [])
      .map(retrievalCategory)
      .filter(Boolean)
      .slice(0, CHUNK_CATEGORIES.length),
    conflict_signals: conflictSignals,
    chunk_count: Math.max(0, Math.min(50, Number(side && side.chunk_count) || 0))
  }
}

function redactRetrieval(retrieval) {
  const input = retrieval && typeof retrieval === 'object' ? retrieval : {}
  return {
    retrieval_version: input.retrieval_version === RETRIEVAL_VERSION ? RETRIEVAL_VERSION : '',
    top_k: 3,
    candidate_pool_limit: 50,
    a_to_b: redactedRetrievalSide(input.a_to_b),
    b_to_a: redactedRetrievalSide(input.b_to_a),
    mutual_score: boundedScore(input.mutual_score),
    reason: boundedReason(input.reason)
  }
}

function allowedKeysFromRetrieval(retrieval) {
  const keys = []
  for (const side of [retrieval && retrieval.a_to_b, retrieval && retrieval.b_to_a]) {
    for (const hit of (side && side.top_evidence) || []) {
      const evidenceKey = retrievalEvidenceKey(hit && hit.evidence_key)
      const queryEvidenceKey = retrievalEvidenceKey(hit && hit.query_evidence_key)
      if (evidenceKey) keys.push(evidenceKey)
      if (queryEvidenceKey) keys.push(queryEvidenceKey)
    }
  }
  return [...new Set(keys)].slice(0, 24)
}

function ragError(reason) {
  const error = new Error(reason)
  error.code = reason
  return error
}

function retrievalInsufficient(retrieval) {
  if (!retrieval || retrieval.retrieval_version !== RETRIEVAL_VERSION) return true
  return Boolean(
    retrieval.reason
      || (retrieval.a_to_b && retrieval.a_to_b.reason)
      || (retrieval.b_to_a && retrieval.b_to_a.reason)
      || !Number.isFinite(Number(retrieval.mutual_score))
  )
}

async function attachRetrieval(eligible, user, settingsByUserId, options = {}) {
  if (typeof options.loadCorpus !== 'function') throw ragError('corpus_unavailable')
  const cappedEligible = (Array.isArray(eligible) ? eligible : []).slice(0, 10)
  const ids = [user && user.id]
    .concat(cappedEligible.map((item) => item && item.candidate && item.candidate.id))
    .map((id) => Number(id))
    .filter((id, index, all) => Number.isSafeInteger(id) && id > 0 && all.indexOf(id) === index)
  if (!ids.length) throw ragError('corpus_invalid')
  const corpus = await options.loadCorpus(ids)
  if (!corpus || typeof corpus !== 'object' || Array.isArray(corpus)) throw ragError('corpus_invalid')

  const enriched = []
  for (const item of cappedEligible) {
    const partner = item && item.candidate
    if (!partner || !Number.isSafeInteger(Number(partner.id)) || Number(partner.id) <= 0) {
      throw ragError('corpus_invalid')
    }
    const partnerSetting = settingsByUserId[String(partner.id)] || {}
    const currentSetting = settingsByUserId[String(user && user.id)] || {}
    const retrieval = await retrieveSparseBidirectional({
      userA: user,
      settingsA: currentSetting,
      userB: partner,
      settingsB: partnerSetting
    }, corpus)
    if (retrievalInsufficient(retrieval)) throw ragError('sparse_retrieval_insufficient')
    const safeRetrieval = redactRetrieval(retrieval)
    enriched.push(Object.assign({}, item, {
      retrieval: safeRetrieval,
      allowedEvidenceKeys: allowedKeysFromRetrieval(safeRetrieval)
    }))
  }
  return enriched
}

/**
 * Deterministic bilateral AI Match Profile fit (A→B / B→A / min-sensitive mutual).
 * Never throws; missing profiles simply leave bilateral_fit absent so the
 * final-score blend falls back to the other components.
 */
function attachBilateralFit(ranked, user, settingsByUserId) {
  const settings = settingsByUserId || {}
  const viewer = aiProfileOf(settings[String(user && user.id)])
  if (!viewer) return (Array.isArray(ranked) ? ranked : []).slice()
  return (Array.isArray(ranked) ? ranked : []).map((item) => {
    if (!item || !item.candidate) return item
    const partner = aiProfileOf(settings[String(item.candidate.id)])
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

function candidateIdentity(item) {
  if (!item || !item.candidate || item.candidate.id === undefined || item.candidate.id === null) return ''
  return String(item.candidate.id)
}

function projectActiveRanked(original, enriched) {
  const source = Array.isArray(original) ? original : []
  const enrichedRows = Array.isArray(enriched) ? enriched : []
  const originalEligible = source.filter((item) => item && item.quality && item.quality.pass === true)
  const enrichedEligible = enrichedRows.filter((item) => item && item.quality && item.quality.pass === true)
  const orderedEligible = applyRagMode('active', originalEligible, enrichedEligible)
  const enrichedById = new Map(enrichedEligible.map((item) => [candidateIdentity(item), item]))
  const orderedEnriched = orderedEligible.map((item) => enrichedById.get(candidateIdentity(item)) || item)
  let cursor = 0
  return source.map((item) => {
    if (!item || !item.quality || item.quality.pass !== true) return item
    const replacement = orderedEnriched[cursor]
    cursor += 1
    return replacement || item
  })
}

function promptEvidenceFor(item) {
  const retrieval = item && item.retrieval
  const side = (value) => (Array.isArray(value && value.top_evidence) ? value.top_evidence : [])
    .map((hit) => ({
      evidence_key: hit.evidence_key,
      category: hit.category,
      score: boundedScore(hit.score),
      query_evidence_key: hit.query_evidence_key,
      query_category: hit.query_category
    }))
    .filter((hit) => hit.evidence_key && hit.query_evidence_key)
    .slice(0, 3)
  return {
    a_to_b: side(retrieval && retrieval.a_to_b),
    b_to_a: side(retrieval && retrieval.b_to_a)
  }
}

function buildSafeRerankRequest(items) {
  const request = buildSemanticRerankRequest({
    topK: 10,
    candidates: items.map((item) => {
      return {
        internalUserId: item.candidate.id,
        quality: item.quality,
        mutualScore: item.mutualScore,
        viewSimilarity: item.viewSimilarity,
        scoreA: item.scoreA,
        scoreB: item.scoreB,
        retrieval: item.retrieval,
        allowedEvidenceKeys: item.allowedEvidenceKeys
      }
    })
  })

  // The legacy builder accepts source excerpts for older semantic retrieval.
  // Sparse RAG must expose only allowlisted keys, categories, and scores.
  request.candidates = request.candidates.map((candidate, index) => {
    const safeCandidate = Object.assign({}, candidate)
    delete safeCandidate.intent_a
    delete safeCandidate.intent_b
    delete safeCandidate.supplement_a
    delete safeCandidate.supplement_b
    safeCandidate.retrieved_evidence = promptEvidenceFor(items[index])
    return safeCandidate
  })
  return request
}

function degradedResult(reason, ranked, mode, extra = {}) {
  return resultWithMetadata(ranked, mode, Object.assign({}, extra, {
    degraded: true,
    reason
  }))
}

async function semanticRerank(ranked, user, settingsByUserId, options = {}) {
  const original = Array.isArray(ranked) ? ranked : []
  const settings = settingsByUserId || {}
  const runOptions = options && typeof options === 'object' ? options : {}
  const optionMode = Object.prototype.hasOwnProperty.call(runOptions, 'ragMode')
    ? runOptions.ragMode
    : process.env.MATCH_RAG_MODE
  const mode = resolveRagMode({ MATCH_RAG_MODE: optionMode })
  const eligible = original.filter((item) => item && item.quality && item.quality.pass === true)
  const withBilateral = attachBilateralFit(original, user, settings)
  const deterministic = withFinalScores(withBilateral)
  if (!eligible.length) {
    return Object.assign(resultWithMetadata(deterministic, mode, { reason: 'no_candidates' }), {
      applied: false
    })
  }
  if (mode === 'off') {
    // Preserve the legacy selfcheck's diagnostic when callers have not opted
    // into a RAG mode at all. This remains deterministic and never loads the
    // corpus; explicit off (the production setting) returns a clean result.
    if (process.env.MATCH_RAG_MODE === undefined
      && process.env.MATCH_EMBEDDING_PROVIDER === undefined
      && Object.keys(runOptions).length === 0) {
      return degradedResult('semantic_retrieval_unavailable', deterministic, mode)
    }
    return resultWithMetadata(deterministic, mode)
  }

  // The matching RAG contract is intentionally pinned to the CloudBase HY3
  // deployment. Other application AI settings must never silently reroute
  // this path to a different provider or model.
  if (typeof runOptions.rerank !== 'function' && !ragProviderConfig().valid) {
    return degradedResult('provider_config_invalid', deterministic, mode, {
      provider: RAG_PROVIDER,
      model: RAG_MODEL
    })
  }

  try {
    const withRetrieval = await attachRetrieval(eligible, user, settings, runOptions)
    const byId = new Map(withRetrieval.map((item) => [candidateIdentity(item), item]))
    const rankedWithRetrieval = withBilateral.map((item) => byId.get(candidateIdentity(item)) || item)
    const request = buildSafeRerankRequest(withRetrieval)
    const rerank = typeof runOptions.rerank === 'function'
      ? runOptions.rerank
      : deepseek.rerankMutualMatchCandidates
    // Keep the validator's private candidate map local. The provider receives
    // only the JSON-serializable allowlisted payload, never hidden internal
    // identifiers attached by the legacy request builder.
    const providerRequest = JSON.parse(JSON.stringify(request))
    const remote = await rerank(providerRequest)
    if (!remote || !remote.enabled || !remote.response) {
      return degradedResult('disabled', deterministic, mode, {
        provider: RAG_PROVIDER,
        model: RAG_MODEL
      })
    }
    const validated = validateSemanticRerankResponse(remote.response, request)
    const merged = mergeSemanticRerank(rankedWithRetrieval, validated, { minConfidence: 0.65, maxWeight: 0.2 })
    if (!merged.applied) {
      return degradedResult(merged.reason || 'low_confidence', deterministic, mode, {
        provider: safeRagProvider(remote.provider),
        model: safeRagModel(remote.model)
      })
    }
    const scored = withFinalScores(merged.ranked)
    const activeRanked = projectActiveRanked(deterministic, scored)
    const projected = mode === 'shadow'
      ? applyRagMode('shadow', deterministic, scored)
      : activeRanked
    return resultWithMetadata(projected, mode, {
      degraded: false,
      reason: '',
      provider: safeRagProvider(remote.provider),
      model: safeRagModel(remote.model)
    })
  } catch (error) {
    return degradedResult(classifySemanticRerankError(error), deterministic, mode, {
      provider: '',
      model: ''
    })
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
  aiProfileOf,
  redactRetrieval
}
