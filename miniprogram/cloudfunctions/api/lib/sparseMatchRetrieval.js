const {
  buildEvidenceChunks,
  CHUNK_CATEGORIES
} = require('./matchEvidenceChunks')
const { expandForLexical } = require('./matchSemanticRetrieval')

const RETRIEVAL_VERSION = 'sparse_bm25_v1'
const TOP_K = 3
const CANDIDATE_POOL_LIMIT = 50
const BM25_K1 = 1.2
const BM25_B = 0.75
const MAX_TEXT_LENGTH = 500
const MAX_TOKEN_COUNT = 1200

// Keep this mapping in lockstep with the existing semantic retriever. A query
// chunk is only allowed to inspect the corresponding document categories.
const QUERY_TO_DOC = Object.freeze({
  values_target: Object.freeze(['values_self', 'life_plan', 'appearance_self', 'relationship_style']),
  other_requirements: Object.freeze(['values_self', 'life_plan', 'deal_breakers', 'marriage_and_baby']),
  appearance_target: Object.freeze(['appearance_self']),
  marriage_and_baby: Object.freeze(['marriage_and_baby']),
  city_plan: Object.freeze(['city_plan'])
})

function finiteNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .slice(0, MAX_TEXT_LENGTH)
}

function normalizeToken(value) {
  return String(value || '').normalize('NFKC').toLowerCase().trim()
}

/**
 * Tokenize sanitized profile text into bounded character unigrams and bigrams.
 * Existing lexical synonym expansion is retained for sparse-only recall; no
 * embedding or vector representation is created here.
 */
function tokenizeSparse(text) {
  const expanded = expandForLexical(normalizeText(text))
  if (!expanded) return []

  // Match the existing lexical contract: punctuation and whitespace are not
  // useful retrieval terms, while Chinese characters and ordinary word
  // characters remain eligible. Keep the source bounded before expansion and
  // cap the resulting terms as a second guard for malformed input.
  const cleaned = expanded
    .replace(/[\s\u3000,.，。！？!?、；;：:\n\r\t]/g, '')
    .slice(0, MAX_TEXT_LENGTH + 120)
  if (!cleaned) return []

  const tokens = []
  for (let index = 0; index < cleaned.length && tokens.length < MAX_TOKEN_COUNT; index += 1) {
    const token = normalizeToken(cleaned[index])
    if (token) tokens.push(token)
  }
  for (let index = 0; index < cleaned.length - 1 && tokens.length < MAX_TOKEN_COUNT; index += 1) {
    const token = normalizeToken(cleaned.slice(index, index + 2))
    if (token) tokens.push(token)
  }
  return tokens
}

function tokensForDocument(document) {
  if (!document || typeof document !== 'object') return []
  if (Array.isArray(document.tokens)) {
    return document.tokens
      .map(normalizeToken)
      .filter(Boolean)
      .slice(0, MAX_TOKEN_COUNT)
  }
  return tokenizeSparse(document.sanitized_text || document.evidence_text || document.text)
}

function stripVectorFields(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => stripVectorFields(item, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return undefined
  seen.add(value)
  const output = {}
  for (const [key, item] of Object.entries(value)) {
    if (/(?:vector|embedding)/i.test(key)) continue
    const safeValue = stripVectorFields(item, seen)
    if (safeValue !== undefined) output[key] = safeValue
  }
  return output
}

function documentForScoring(document) {
  return {
    original: document,
    safe: stripVectorFields(document),
    tokens: tokensForDocument(document)
  }
}

function scoreBm25(queryTokens, documents, options = {}) {
  const config = options && typeof options === 'object' ? options : {}
  const query = (Array.isArray(queryTokens) ? queryTokens : [])
    .map(normalizeToken)
    .filter(Boolean)
  const uniqueQuery = [...new Set(query)]
  const rows = (Array.isArray(documents) ? documents : [])
    .filter((document) => document && typeof document === 'object')
    .map(documentForScoring)
  if (!uniqueQuery.length || !rows.length) return []

  const k1 = Math.max(0, finiteNumber(config.k1, BM25_K1))
  const b = Math.max(0, Math.min(1, finiteNumber(config.b, BM25_B)))
  const averageLength = rows.reduce((sum, row) => sum + row.tokens.length, 0) / rows.length || 1
  const documentFrequency = new Map()
  for (const token of uniqueQuery) {
    let frequency = 0
    for (const row of rows) {
      if (row.tokens.includes(token)) frequency += 1
    }
    documentFrequency.set(token, frequency)
  }

  const scored = rows.map((row, index) => {
    const frequencies = new Map()
    for (const token of row.tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1)
    const documentLength = row.tokens.length
    let score = 0
    for (const token of uniqueQuery) {
      const termFrequency = frequencies.get(token) || 0
      if (!termFrequency) continue
      const frequency = documentFrequency.get(token) || 0
      const idf = Math.log(1 + ((rows.length - frequency + 0.5) / (frequency + 0.5)))
      const denominator = termFrequency + k1 * (1 - b + b * (documentLength / averageLength))
      score += idf * ((termFrequency * (k1 + 1)) / (denominator || 1))
    }
    return {
      document: row.safe,
      score: Math.round(Math.max(0, score) * 1000000) / 1000000,
      _index: index
    }
  })

  scored.sort((left, right) => {
    const scoreDelta = right.score - left.score
    if (scoreDelta) return scoreDelta
    const leftKey = String(left.document.evidence_key || left.document.id || '')
    const rightKey = String(right.document.evidence_key || right.document.id || '')
    return leftKey.localeCompare(rightKey) || left._index - right._index
  })
  return scored.map(({ _index, ...row }) => row)
}

function corpusRows(corpusByUserId, userId) {
  if (!corpusByUserId) return []
  let rows
  if (corpusByUserId instanceof Map) {
    rows = corpusByUserId.get(String(userId))
    if (rows === undefined) rows = corpusByUserId.get(Number(userId))
  } else if (typeof corpusByUserId === 'object') {
    rows = corpusByUserId[String(userId)]
  }
  if (rows && !Array.isArray(rows) && Array.isArray(rows.chunks)) rows = rows.chunks
  return (Array.isArray(rows) ? rows : [])
    .filter((document) => document && typeof document === 'object' && document.enabled !== false)
    .filter((document) => !document.retrieval_version || document.retrieval_version === RETRIEVAL_VERSION)
    .filter((document) => !document.owner_user_id || String(document.owner_user_id) === String(userId))
    .filter((document) => CHUNK_CATEGORIES.includes(String(document.category || '')))
}

function scoreToPercent(score) {
  const raw = Math.max(0, finiteNumber(score, 0))
  if (!raw) return 0
  // BM25 is unbounded; this monotonic saturation keeps the existing 0..100
  // retrieval contract without turning a non-match into positive evidence.
  return Math.round((raw / (raw + 1)) * 1000) / 10
}

function missingCategories(documents) {
  const present = new Set(documents.map((document) => document.category))
  return CHUNK_CATEGORIES.filter((category) => !present.has(category))
}

function conflictSignals(queryChunks, docChunks) {
  const signals = []
  const babyQuery = queryChunks.find((chunk) => chunk.category === 'marriage_and_baby')
  const babyDocument = docChunks.find((chunk) => chunk.category === 'marriage_and_baby')
  if (!babyQuery || !babyDocument) return signals

  const wantsNoChildren = /丁克|不要孩子/.test(babyQuery.sanitized_text)
  const documentWantsChildren = /要孩子|生育|生娃|3-5年内/.test(babyDocument.sanitized_text)
  const wantsChildren = /要孩子|生育|生娃|3-5年内/.test(babyQuery.sanitized_text)
  const documentWantsNoChildren = /丁克|不要孩子/.test(babyDocument.sanitized_text)
  if ((wantsNoChildren && documentWantsChildren) || (wantsChildren && documentWantsNoChildren)) {
    signals.push({
      code: 'marriage_and_baby_conflict',
      evidence_keys: [babyQuery.evidence_key, babyDocument.evidence_key]
    })
  }
  return signals
}

function retrieveOneWay(queryUser, querySettings, docUser, docSettings, corpusByUserId, options = {}) {
  const config = options && typeof options === 'object' ? options : {}
  const queryChunks = buildEvidenceChunks(queryUser || {}, querySettings || {})
    .filter((chunk) => Object.prototype.hasOwnProperty.call(QUERY_TO_DOC, chunk.category))
  const requestedPoolLimit = Number(config.candidatePoolLimit)
  const poolLimit = Number.isInteger(requestedPoolLimit) && requestedPoolLimit > 0
    ? Math.min(CANDIDATE_POOL_LIMIT, requestedPoolLimit)
    : CANDIDATE_POOL_LIMIT
  const topKValue = Number(config.topK)
  const topK = Number.isInteger(topKValue) && topKValue > 0
    ? Math.min(TOP_K, topKValue)
    : TOP_K
  const documents = corpusRows(corpusByUserId, docUser && docUser.id).slice(0, poolLimit)
  const hits = []

  for (const query of queryChunks) {
    const allowedCategories = new Set(QUERY_TO_DOC[query.category] || [])
    const eligibleDocuments = documents.filter((document) => allowedCategories.has(document.category))
    const ranked = scoreBm25(tokenizeSparse(query.sanitized_text), eligibleDocuments, config)
    for (const item of ranked.slice(0, topK)) {
      const document = item.document || {}
      const rawScore = item.score
      hits.push({
        evidence_key: String(document.evidence_key || ''),
        category: String(document.category || ''),
        score: scoreToPercent(rawScore),
        evidence_text: String(document.sanitized_text || ''),
        query_evidence_key: String(query.evidence_key || ''),
        query_category: String(query.category || ''),
        query_evidence_text: String(query.sanitized_text || ''),
        _raw_score: rawScore
      })
    }
  }

  hits.sort((left, right) => right.score - left.score
    || right._raw_score - left._raw_score
    || left.evidence_key.localeCompare(right.evidence_key)
    || left.query_evidence_key.localeCompare(right.query_evidence_key))
  const top = hits.slice(0, topK).map(({ _raw_score, ...hit }) => hit)
  const conflicts = conflictSignals(queryChunks, documents)
  const rawScore = top.length
    ? Math.round(top.reduce((sum, item) => sum + item.score, 0) / top.length)
    : 0
  const score = conflicts.length ? Math.min(rawScore, 20) : rawScore
  const reason = top.length ? '' : 'sparse_retrieval_insufficient'
  return {
    score,
    top_evidence: top,
    missing_categories: missingCategories(documents),
    conflict_signals: conflicts,
    chunk_count: documents.length,
    reason
  }
}

async function retrieveSparseBidirectional(pair = {}, corpusByUserId = {}, options = {}) {
  const input = pair && typeof pair === 'object' ? pair : {}
  const aToB = retrieveOneWay(
    input.userA,
    input.settingsA,
    input.userB,
    input.settingsB,
    corpusByUserId,
    options
  )
  const bToA = retrieveOneWay(
    input.userB,
    input.settingsB,
    input.userA,
    input.settingsA,
    corpusByUserId,
    options
  )
  const insufficient = !aToB.top_evidence.length || !bToA.top_evidence.length
  return {
    retrieval_version: RETRIEVAL_VERSION,
    top_k: TOP_K,
    candidate_pool_limit: CANDIDATE_POOL_LIMIT,
    a_to_b: aToB,
    b_to_a: bToA,
    mutual_score: Math.round((aToB.score + bToA.score) / 2),
    ...(insufficient ? { reason: 'sparse_retrieval_insufficient' } : {})
  }
}

module.exports = {
  RETRIEVAL_VERSION,
  TOP_K,
  CANDIDATE_POOL_LIMIT,
  BM25_K1,
  BM25_B,
  QUERY_TO_DOC,
  MAX_TEXT_LENGTH,
  MAX_TOKEN_COUNT,
  tokenizeSparse,
  scoreBm25,
  retrieveSparseBidirectional,
  retrieveOneWay,
  scoreToPercent
}
