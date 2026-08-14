const { buildEvidenceChunks, CHUNK_CATEGORIES } = require('./matchEvidenceChunks')
const { createEmbeddingProvider, cosineSimilarity } = require('./embeddingProvider')

const RETRIEVAL_VERSION = 'semantic_retrieval_v1'
const TOP_K = 3
const CANDIDATE_POOL_LIMIT = 50
const QUERY_TO_DOC = {
  values_target: ['values_self', 'life_plan', 'appearance_self', 'relationship_style'],
  other_requirements: ['values_self', 'life_plan', 'deal_breakers', 'marriage_and_baby'],
  appearance_target: ['appearance_self'],
  marriage_and_baby: ['marriage_and_baby'],
  city_plan: ['city_plan']
}

const SYNONYM_GROUPS = [
  ['踏实', '稳重', '可靠'],
  ['担当', '责任心', '负责'],
  ['真诚', '坦诚', '真心'],
  ['丁克', '不要孩子'],
  ['要孩子', '生育', '生娃']
]

function tokenize(text) {
  if (!text || typeof text !== 'string') return []
  const cleaned = text.replace(/[\s\u3000,.，。！？!?\n\r\t]/g, '')
  const tokens = []
  for (let i = 0; i < cleaned.length; i += 1) tokens.push(cleaned[i])
  for (let i = 0; i < cleaned.length - 1; i += 1) tokens.push(cleaned.slice(i, i + 2))
  return tokens
}

function expandForLexical(text) {
  let value = String(text || '')
  for (const group of SYNONYM_GROUPS) {
    if (group.some((token) => value.includes(token))) value += ` ${group.join(' ')}`
  }
  return value
}

function lexicalSimilarity(left, right) {
  const a = new Set(tokenize(expandForLexical(left)))
  const b = new Set(tokenize(expandForLexical(right)))
  if (!a.size || !b.size) return 0
  let hit = 0
  a.forEach((item) => { if (b.has(item)) hit += 1 })
  return hit / (a.size + b.size - hit)
}

function hybridScore(queryVec, docVec, queryText, docText) {
  const semantic = Math.max(0, cosineSimilarity(queryVec, docVec))
  const lexical = lexicalSimilarity(queryText, docText)
  return Math.round(Math.max(semantic, lexical) * 1000) / 10
}

async function embedChunks(provider, chunks) {
  if (!chunks.length) return []
  const vectors = await provider.embed(chunks.map((chunk) => chunk.sanitized_text))
  return chunks.map((chunk, index) => Object.assign({}, chunk, { vector: vectors[index] }))
}

function missingCategories(chunks) {
  const present = new Set(chunks.map((chunk) => chunk.category))
  return CHUNK_CATEGORIES.filter((category) => !present.has(category))
}

function conflictSignals(queryChunks, docChunks) {
  const signals = []
  const babyQ = queryChunks.find((chunk) => chunk.category === 'marriage_and_baby')
  const babyD = docChunks.find((chunk) => chunk.category === 'marriage_and_baby')
  if (babyQ && babyD) {
    const wantNo = /丁克|不要孩子/.test(babyQ.sanitized_text)
    const hasKids = /要孩子|生育|生娃|3-5年内/.test(babyD.sanitized_text)
    const wantKids = /要孩子|生育|生娃|3-5年内/.test(babyQ.sanitized_text)
    const hasNo = /丁克|不要孩子/.test(babyD.sanitized_text)
    if ((wantNo && hasKids) || (wantKids && hasNo)) {
      signals.push({ code: 'marriage_and_baby_conflict', evidence_keys: [babyQ.evidence_key, babyD.evidence_key] })
    }
  }
  return signals
}

async function retrieveOneWay(queryUser, querySettings, docUser, docSettings, provider) {
  const queryChunks = buildEvidenceChunks(queryUser, querySettings)
  const docChunks = buildEvidenceChunks(docUser, docSettings)
  const queryEmbedded = await embedChunks(provider, queryChunks.filter((chunk) => QUERY_TO_DOC[chunk.category]))
  const docEmbedded = await embedChunks(provider, docChunks)
  const hits = []
  for (const query of queryEmbedded) {
    const allowed = new Set(QUERY_TO_DOC[query.category] || [])
    const ranked = docEmbedded
      .filter((doc) => allowed.has(doc.category))
      .map((doc) => ({
        evidence_key: doc.evidence_key,
        category: doc.category,
        score: hybridScore(query.vector, doc.vector, query.sanitized_text, doc.sanitized_text),
        query_evidence_key: query.evidence_key,
        query_category: query.category
      }))
      .sort((left, right) => right.score - left.score || left.evidence_key.localeCompare(right.evidence_key))
      .slice(0, TOP_K)
    hits.push(...ranked)
  }
  hits.sort((left, right) => right.score - left.score)
  const top = hits.slice(0, TOP_K)
  const score = top.length ? Math.round(top.reduce((sum, item) => sum + item.score, 0) / top.length) : 0
  return {
    score,
    top_evidence: top,
    missing_categories: missingCategories(docChunks),
    conflict_signals: conflictSignals(queryChunks, docChunks),
    chunk_count: docChunks.length
  }
}

async function retrieveBidirectional(pair, options = {}) {
  const provider = options.provider || createEmbeddingProvider({
    provider: options.providerName || process.env.MATCH_EMBEDDING_PROVIDER || 'stub'
  })
  if (provider.name === 'none') {
    const error = new Error('semantic_retrieval_unavailable')
    error.code = 'semantic_retrieval_unavailable'
    throw error
  }
  const aToB = await retrieveOneWay(pair.userA, pair.settingsA, pair.userB, pair.settingsB, provider)
  const bToA = await retrieveOneWay(pair.userB, pair.settingsB, pair.userA, pair.settingsA, provider)
  return {
    retrieval_version: RETRIEVAL_VERSION,
    top_k: TOP_K,
    candidate_pool_limit: CANDIDATE_POOL_LIMIT,
    a_to_b: aToB,
    b_to_a: bToA,
    mutual_score: Math.round((aToB.score + bToA.score) / 2),
    provider: provider.name
  }
}

module.exports = {
  RETRIEVAL_VERSION,
  TOP_K,
  CANDIDATE_POOL_LIMIT,
  retrieveBidirectional,
  retrieveOneWay,
  expandForLexical
}
