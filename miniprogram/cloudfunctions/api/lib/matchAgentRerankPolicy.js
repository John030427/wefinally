const REQUEST_VERSION = 'match_agent_rerank_v1'
const INTERNAL_REF_MAP = Symbol('internalRefMap')
const INTERNAL_EVALUATION_REF = Symbol('internalEvaluationRef')
const DIMENSION_KEYS = [
  'baby',
  'view',
  'psych',
  'age',
  'height',
  'education',
  'circle',
  'city',
  'appearance'
]
const EVIDENCE_CODES = new Set([
  'bilateral_score',
  'view_similarity',
  'psych_compatibility',
  'life_plan_alignment',
  'preference_coverage',
  'missing_evidence'
])
const RISK_CODES = new Set([
  'score_imbalance',
  'low_semantic_evidence',
  'missing_psych_profile',
  'missing_appearance_evidence',
  'borderline_quality'
])

function integerInRange(value, min, max, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label}无效`)
  }
  return number
}

function boundedNumber(value, min, max, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label}无效`)
  }
  return number
}

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

function dimensionPercents(score) {
  const dimensions = (score && score.dimensions) || {}
  return DIMENSION_KEYS.reduce((result, key) => {
    result[key] = percent(dimensions[key] && dimensions[key].percent)
    return result
  }, {})
}

function missingDimensions(scoreA, scoreB) {
  const a = dimensionPercents(scoreA)
  const b = dimensionPercents(scoreB)
  return DIMENSION_KEYS.filter((key) => a[key] === 0 && b[key] === 0)
}

function safeEvaluationRef(value) {
  const ref = String(value || '').trim()
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(ref)) throw new Error('离线评估标识无效')
  return ref
}

function buildRerankRequest(input) {
  const source = input || {}
  const topK = integerInRange(
    source.topK === null || source.topK === undefined ? 10 : source.topK,
    1,
    50,
    'Top-K'
  )
  const eligible = (Array.isArray(source.candidates) ? source.candidates : [])
    .filter((item) => item && item.quality && item.quality.pass === true)
    .slice(0, topK)
  if (!eligible.length) throw new Error('没有通过确定性质量门槛的候选')

  const internalByRef = new Map()
  const candidates = eligible.map((item, index) => {
    const candidateRef = `candidate_${index + 1}`
    const maxTotal = Math.max(
      Number(item.scoreA && item.scoreA.maxTotal || 0),
      Number(item.scoreB && item.scoreB.maxTotal || 0)
    )
    if (item.internalUserId === null || item.internalUserId === undefined) {
      throw new Error('候选内部映射缺失')
    }
    internalByRef.set(candidateRef, item.internalUserId)
    return {
      candidate_ref: candidateRef,
      algorithm_rank: index + 1,
      mutual_score_percent: maxTotal
        ? percent((Number(item.mutualScore || 0) / maxTotal) * 100)
        : 0,
      side_a_percent: percent(item.scoreA && item.scoreA.normalizedTotal),
      side_b_percent: percent(item.scoreB && item.scoreB.normalizedTotal),
      view_similarity: percent(item.viewSimilarity),
      quality_gate_pass: true,
      side_a_dimensions: dimensionPercents(item.scoreA),
      side_b_dimensions: dimensionPercents(item.scoreB),
      missing_dimensions: missingDimensions(item.scoreA, item.scoreB)
    }
  })

  const request = {
    version: REQUEST_VERSION,
    task: 'rerank_only',
    constraints: {
      may_reorder_only: true,
      database_access: false,
      database_write: false,
      reject_unknown_candidate_ref: true
    },
    candidates
  }
  Object.defineProperty(request, INTERNAL_REF_MAP, {
    value: internalByRef,
    enumerable: false,
    writable: false
  })
  Object.defineProperty(request, INTERNAL_EVALUATION_REF, {
    value: safeEvaluationRef(source.evaluationId),
    enumerable: false,
    writable: false
  })
  return request
}

function stringCodes(values, allowed, label) {
  if (!Array.isArray(values) || values.length > 6) throw new Error(`${label}无效`)
  return values.map((value) => {
    const code = String(value || '').trim()
    if (!allowed.has(code)) throw new Error(`${label}包含未允许代码`)
    return code
  })
}

function validateRerankResponse(response, request) {
  if (!response || response.version !== REQUEST_VERSION) throw new Error('重排响应版本无效')
  const internalByRef = request && request[INTERNAL_REF_MAP]
  if (!(internalByRef instanceof Map)) throw new Error('重排请求映射无效')
  if (!Array.isArray(response.ranking) || response.ranking.length !== internalByRef.size) {
    throw new Error('重排响应候选数量无效')
  }

  const seenRefs = new Set()
  const seenRanks = new Set()
  const validated = response.ranking.map((item) => {
    const entry = item || {}
    const candidateRef = String(entry.candidate_ref || '').trim()
    if (!internalByRef.has(candidateRef)) throw new Error('重排响应包含未知候选引用')
    if (seenRefs.has(candidateRef)) throw new Error('重排响应候选引用重复')
    seenRefs.add(candidateRef)

    const rank = integerInRange(entry.rank, 1, internalByRef.size, '重排名次')
    if (seenRanks.has(rank)) throw new Error('重排响应名次重复')
    seenRanks.add(rank)

    return {
      internalUserId: internalByRef.get(candidateRef),
      candidateRef,
      rank,
      confidence: boundedNumber(entry.confidence, 0, 1, '重排置信度'),
      evidenceCodes: stringCodes(entry.evidence_codes, EVIDENCE_CODES, '重排证据'),
      riskCodes: stringCodes(entry.risk_codes, RISK_CODES, '重排风险')
    }
  })
  return validated.sort((left, right) => left.rank - right.rank)
}

module.exports = {
  REQUEST_VERSION,
  buildRerankRequest,
  validateRerankResponse
}
