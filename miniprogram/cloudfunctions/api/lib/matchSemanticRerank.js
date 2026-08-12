const RERANK_VERSION = 'match_semantic_rerank_v1'
const INTERNAL_REF_MAP = Symbol('semanticInternalRefMap')
const ALLOWED_EVIDENCE_TAGS = new Set([
  'bilateral_score',
  'psych_compatibility',
  'life_plan_alignment',
  'preference_coverage',
  'appearance_preference',
  'missing_evidence'
])
const FORBIDDEN_OUTPUT_PATTERN = /(?:1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:openid|unionid|session[_ -]?key|token)\b|手机号|手机号码|微信号|联系方式|精确地址)/i

function integer(value, min, max, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label}无效`)
  return number
}

function score(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error(`${label}无效`)
  return number
}

function confidence(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${label}无效`)
  return number
}

function safeItems(value) {
  const values = Array.isArray(value) ? value : []
  return values.map((item) => {
    const text = typeof item === 'string' ? item : (item && item.value)
    return String(text || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 80)
  }).filter(Boolean).slice(0, 8)
}

function intentSummary(profile) {
  const input = profile || {}
  return {
    values: safeItems(input.values),
    lifestyle: safeItems(input.lifestyle),
    appearance_preferences: safeItems(input.appearance_preferences),
    uncertainties: safeItems(input.uncertainties),
    profile_confidence: confidence(input.profile_confidence === undefined ? 0 : input.profile_confidence, '画像置信度')
  }
}

function buildSemanticRerankRequest(input = {}) {
  const topK = integer(input.topK === undefined ? 10 : input.topK, 1, 50, 'Top-K')
  const candidates = (Array.isArray(input.candidates) ? input.candidates : [])
    .filter((item) => item && item.quality && item.quality.pass === true)
    .slice(0, topK)
  if (!candidates.length) throw new Error('没有通过确定性质量门槛的候选')

  const internalByRef = new Map()
  const safeCandidates = candidates.map((item, index) => {
    if (item.internalUserId === null || item.internalUserId === undefined) throw new Error('候选内部映射缺失')
    const ref = `candidate_${index + 1}`
    internalByRef.set(ref, item.internalUserId)
    return {
      candidate_ref: ref,
      algorithm_rank: index + 1,
      side_a_percent: Math.max(0, Math.min(100, Math.round(Number(item.scoreA && item.scoreA.normalizedTotal || 0)))),
      side_b_percent: Math.max(0, Math.min(100, Math.round(Number(item.scoreB && item.scoreB.normalizedTotal || 0)))),
      mutual_score_percent: Math.max(0, Math.min(100, Math.round(Number(item.mutualScore || 0)))),
      view_similarity: Math.max(0, Math.min(100, Math.round(Number(item.viewSimilarity || 0)))),
      intent_a: intentSummary(item.intentA),
      intent_b: intentSummary(item.intentB),
      supplement_a: item.supplementA ? '补充需求已脱敏' : '',
      supplement_b: item.supplementB ? '补充需求已脱敏' : ''
    }
  })
  const request = {
    version: RERANK_VERSION,
    task: 'semantic_rerank_only',
    constraints: {
      may_reorder_only: true,
      database_access: false,
      database_write: false,
      direct_identity_access: false,
      reject_unknown_candidate_ref: true
    },
    candidates: safeCandidates
  }
  Object.defineProperty(request, INTERNAL_REF_MAP, {
    value: internalByRef,
    enumerable: false,
    writable: false
  })
  return request
}

function textList(value, label) {
  if (!Array.isArray(value) || value.length > 6) throw new Error(`${label}无效`)
  const values = value.map((item) => String(item || '').trim().slice(0, 80)).filter(Boolean)
  if (values.some((item) => FORBIDDEN_OUTPUT_PATTERN.test(item))) throw new Error(`${label}包含隐私信息`)
  return values
}

function validateSemanticRerankResponse(response, request) {
  if (!response || response.version !== RERANK_VERSION) throw new Error('语义重排响应版本无效')
  const internalByRef = request && request[INTERNAL_REF_MAP]
  if (!(internalByRef instanceof Map)) throw new Error('语义重排请求映射无效')
  if (!Array.isArray(response.ranking) || response.ranking.length !== internalByRef.size) throw new Error('语义重排候选数量无效')
  const refs = new Set()
  const ranks = new Set()
  const validated = response.ranking.map((item) => {
    const row = item || {}
    const candidateRef = String(row.candidate_ref || '').trim()
    if (!internalByRef.has(candidateRef)) throw new Error('语义重排包含未知候选引用')
    if (refs.has(candidateRef)) throw new Error('语义重排候选引用重复')
    refs.add(candidateRef)
    const rank = integer(row.rank, 1, internalByRef.size, '语义重排名次')
    if (ranks.has(rank)) throw new Error('语义重排名次重复')
    ranks.add(rank)
    const evidenceTags = textList(row.evidence_tags, '语义重排证据').map((tag) => {
      if (!ALLOWED_EVIDENCE_TAGS.has(tag)) throw new Error('语义重排包含未允许证据')
      return tag
    })
    return {
      internalUserId: internalByRef.get(candidateRef),
      candidateRef,
      rank,
      aToBSemanticScore: score(row.a_to_b_semantic_score, 'A到B语义分'),
      bToASemanticScore: score(row.b_to_a_semantic_score, 'B到A语义分'),
      mutualSemanticScore: score(row.mutual_semantic_score, '双向语义分'),
      mutualStrengths: textList(row.mutual_strengths, '共同满足点'),
      asymmetricRisks: textList(row.asymmetric_risks, '不对称风险'),
      confirmationQuestions: textList(row.confirmation_questions, '待确认问题'),
      evidenceTags,
      dataCompleteness: confidence(row.data_completeness, '数据完整度'),
      confidence: confidence(row.confidence, '语义重排置信度')
    }
  })
  return validated.sort((left, right) => left.rank - right.rank)
}

function mergeSemanticRerank(ranked, validated, options = {}) {
  const minConfidence = Number.isFinite(Number(options.minConfidence)) ? Number(options.minConfidence) : 0.65
  const maxWeight = Number.isFinite(Number(options.maxWeight)) ? Math.max(0, Math.min(0.2, Number(options.maxWeight))) : 0.2
  const rows = Array.isArray(validated) ? validated : []
  if (!rows.length || rows.some((row) => Number(row.confidence) < minConfidence)) {
    return { applied: false, reason: 'low_confidence', ranked: Array.isArray(ranked) ? ranked : [] }
  }
  const byUserId = new Map(rows.map((row) => [String(row.internalUserId), row]))
  const merged = (Array.isArray(ranked) ? ranked : []).map((item) => {
    const internalUserId = item && item.internalUserId !== undefined
      ? item.internalUserId
      : (item && item.candidate && item.candidate.id)
    const row = byUserId.get(String(internalUserId))
    if (!row) return item
    const base = Number(item.mutualScore || 0)
    const semantic = Number(row.mutualSemanticScore || 0)
    return Object.assign({}, item, {
      ai_rank: row.rank,
      ai_weight: maxWeight,
      a_to_b_semantic_score: row.aToBSemanticScore,
      b_to_a_semantic_score: row.bToASemanticScore,
      mutual_semantic_score: row.mutualSemanticScore,
      semantic_strengths: row.mutualStrengths,
      asymmetric_risks: row.asymmetricRisks,
      confirmation_questions: row.confirmationQuestions,
      semantic_confidence: row.confidence,
      semantic_score: base + ((semantic - base) * maxWeight)
    })
  })
  merged.sort((left, right) => Number(right.semantic_score || right.mutualScore || 0) - Number(left.semantic_score || left.mutualScore || 0))
  return { applied: true, reason: '', ranked: merged }
}

module.exports = {
  RERANK_VERSION,
  buildSemanticRerankRequest,
  validateSemanticRerankResponse,
  mergeSemanticRerank
}
