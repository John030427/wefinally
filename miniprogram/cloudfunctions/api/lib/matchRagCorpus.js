'use strict'

const crypto = require('crypto')
const {
  buildEvidenceChunks,
  CHUNK_SCHEMA_VERSION,
  CHUNK_CATEGORIES,
  contentHash
} = require('./matchEvidenceChunks')
const { tokenizeSparse, RETRIEVAL_VERSION } = require('./sparseMatchRetrieval')
const { sanitizeSupplement } = require('./intentProfile')
const { canEnterFormalCandidatePool } = require('./testIdentityPolicy')
const { MEMBER_STATUS } = require('./memberPolicy')

const CORPUS_COLLECTION = 'user_evidence_chunk'
const CHUNK_VERSION = CHUNK_SCHEMA_VERSION
const PAGE_SIZE = 20
const MAX_PAGE_COUNT = 10
const MAX_TOKEN_COUNT = 1200
const SOURCE_FIELD_BY_CATEGORY = Object.freeze({
  values_self: 'self_view_text',
  values_target: 'target_view_text',
  relationship_style: 'psych_profile_json',
  life_plan: 'career_family',
  city_plan: 'city',
  marriage_and_baby: 'baby_plan',
  appearance_self: 'appearance_description',
  appearance_target: 'appearance_want',
  other_requirements: 'other_requirements',
  deal_breakers: 'deal_breakers'
})
const SAFE_SOURCE_FIELDS = new Set([
  'self_view_text',
  'target_view_text',
  'psych_profile_json',
  'career_family',
  'city',
  'baby_plan',
  'appearance_description',
  'appearance_want',
  'other_requirements',
  'deal_breakers'
])
const FREE_TEXT_CONCEPTS = Object.freeze({
  self_view_text: [
    { label: '真诚', terms: ['真诚', '坦诚'] },
    { label: '责任', terms: ['责任', '负责'] },
    { label: '尊重', terms: ['尊重'] },
    { label: '边界', terms: ['边界'] },
    { label: '稳定', terms: ['稳定', '稳重', '可靠', '踏实'] },
    { label: '沟通', terms: ['沟通', '交流'] },
    { label: '包容', terms: ['包容'] },
    { label: '平等', terms: ['平等'] },
    { label: '独立', terms: ['独立'] },
    { label: '家庭', terms: ['家庭'] },
    { label: '事业', terms: ['事业'] },
    { label: '工作生活平衡', terms: ['工作生活平衡', '工作与生活平衡', '工作生活兼顾'] },
    { label: '生活规划', terms: ['生活规划', '生活计划'] },
    { label: '城市生活', terms: ['城市生活'] },
    { label: '旅行', terms: ['旅行', '旅游'] },
    { label: '运动', terms: ['运动', '健身', '锻炼'] },
    { label: '作息', terms: ['作息'] },
    { label: '温柔', terms: ['温柔'] }
  ],
  target_view_text: [
    { label: '真诚', terms: ['真诚', '坦诚'] },
    { label: '责任', terms: ['责任', '负责'] },
    { label: '尊重', terms: ['尊重'] },
    { label: '边界', terms: ['边界'] },
    { label: '稳定', terms: ['稳定', '稳重', '可靠', '踏实'] },
    { label: '沟通', terms: ['沟通', '交流'] },
    { label: '包容', terms: ['包容'] },
    { label: '平等', terms: ['平等'] },
    { label: '家庭', terms: ['家庭'] },
    { label: '生活规划', terms: ['生活规划', '生活计划'] },
    { label: '工作生活平衡', terms: ['工作生活平衡', '工作与生活平衡', '工作生活兼顾'] },
    { label: '旅行', terms: ['旅行', '旅游'] },
    { label: '运动', terms: ['运动', '健身', '锻炼'] },
    { label: '温柔', terms: ['温柔'] }
  ],
  appearance_description: [
    { label: '自然', terms: ['自然'] },
    { label: '清爽', terms: ['清爽'] },
    { label: '干净', terms: ['干净'] },
    { label: '气质', terms: ['气质'] },
    { label: '阳光', terms: ['阳光'] },
    { label: '成熟', terms: ['成熟'] },
    { label: '温柔', terms: ['温柔'] },
    { label: '文艺', terms: ['文艺'] },
    { label: '健康', terms: ['健康'] },
    { label: '运动', terms: ['运动', '健身'] }
  ],
  appearance_want: [
    { label: '自然', terms: ['自然'] },
    { label: '清爽', terms: ['清爽'] },
    { label: '干净', terms: ['干净'] },
    { label: '气质', terms: ['气质'] },
    { label: '阳光', terms: ['阳光'] },
    { label: '成熟', terms: ['成熟'] },
    { label: '温柔', terms: ['温柔'] },
    { label: '文艺', terms: ['文艺'] },
    { label: '健康', terms: ['健康'] },
    { label: '运动', terms: ['运动', '健身'] }
  ],
  other_requirements: [
    { label: '真诚', terms: ['真诚', '坦诚'] },
    { label: '尊重', terms: ['尊重'] },
    { label: '边界', terms: ['边界'] },
    { label: '稳定', terms: ['稳定', '稳重', '可靠'] },
    { label: '沟通', terms: ['沟通', '交流'] },
    { label: '包容', terms: ['包容'] },
    { label: '家庭', terms: ['家庭'] },
    { label: '生活规划', terms: ['生活规划', '生活计划'] },
    { label: '工作生活平衡', terms: ['工作生活平衡', '工作与生活平衡', '工作生活兼顾'] },
    { label: '旅行', terms: ['旅行', '旅游'] },
    { label: '运动', terms: ['运动', '健身', '锻炼'] },
    { label: '作息', terms: ['作息'] }
  ],
  deal_breakers: [
    { label: '真诚', terms: ['真诚', '坦诚'] },
    { label: '尊重', terms: ['尊重'] },
    { label: '边界', terms: ['边界'] },
    { label: '稳定', terms: ['稳定', '稳重', '可靠'] },
    { label: '沟通', terms: ['沟通', '交流'] },
    { label: '包容', terms: ['包容'] },
    { label: '家庭', terms: ['家庭'] },
    { label: '生活规划', terms: ['生活规划', '生活计划'] },
    { label: '工作生活平衡', terms: ['工作生活平衡', '工作与生活平衡', '工作生活兼顾'] },
    { label: '旅行', terms: ['旅行', '旅游'] },
    { label: '运动', terms: ['运动', '健身', '锻炼'] },
    { label: '作息', terms: ['作息'] }
  ],
  psych_profile_json: [
    { label: '冲突沟通', terms: ['冲突', '沟通'] },
    { label: '安全感', terms: ['安全感'] },
    { label: '个人空间', terms: ['个人空间', '安全空间', '空间'] },
    { label: '家庭边界', terms: ['家庭边界'] },
    { label: '金钱观', terms: ['金钱观', '消费观', '理财观'] },
    { label: '事业家庭平衡', terms: ['事业家庭平衡', '事业与家庭平衡', '工作生活平衡'] }
  ]
})
const CONTROLLED_VALUE_ALIASES = Object.freeze({
  career_family: [
    { label: '事业家庭平衡', values: ['事业家庭平衡', '事业与家庭平衡', '事业和家庭平衡', '工作生活平衡'] },
    { label: '事业优先', values: ['事业优先', '事业第一'] },
    { label: '家庭优先', values: ['家庭优先', '家庭第一'] },
    { label: '家庭事业并重', values: ['家庭事业并重', '事业家庭并重'] }
  ],
  baby_plan: [
    { label: '计划要孩子', values: ['1年内', '一年内', '近期', '尽快', '准备要孩子', '想要孩子'] },
    { label: '3-5年内', values: ['3-5年内', '3至5年内', '3到5年内', '三到五年内', '以后', '将来', '未来'] },
    { label: '不要孩子', values: ['不考虑', '不想要孩子', '不要孩子', '暂不考虑'] },
    { label: '顺其自然', values: ['顺其自然', '不确定', '待定'] }
  ]
})
const BROAD_CITY_NAMES = new Set([
  '北京', '上海', '广州', '深圳', '天津', '重庆', '杭州', '南京', '成都', '武汉', '西安',
  '苏州', '郑州', '长沙', '济南', '青岛', '厦门', '福州', '合肥', '昆明', '南昌', '贵阳',
  '南宁', '海口', '太原', '石家庄', '哈尔滨', '沈阳', '大连', '宁波', '无锡', '佛山', '东莞',
  '珠海', '惠州', '中山', '汕头', '潮州', '揭阳', '湛江', '温州', '嘉兴', '金华', '台州',
  '襄阳', '洛阳', '乌鲁木齐', '兰州', '银川', '西宁', '呼和浩特', '拉萨', '香港', '澳门'
])
const BROAD_CITY_ALIASES = Object.freeze({
  '北京市': '北京',
  '上海市': '上海',
  '广州市': '广州',
  '深圳市': '深圳',
  '天津市': '天津',
  '重庆市': '重庆',
  '杭州市': '杭州',
  '南京市': '南京',
  '成都市': '成都',
  '武汉市': '武汉',
  '西安市': '西安',
  '苏州市': '苏州',
  '郑州市': '郑州',
  '长沙市': '长沙',
  '济南市': '济南',
  '青岛市': '青岛',
  '厦门市': '厦门',
  '福州市': '福州',
  '合肥市': '合肥',
  '昆明市': '昆明',
  '南昌市': '南昌',
  '贵阳市': '贵阳',
  '南宁市': '南宁',
  '海口市': '海口',
  '太原市': '太原',
  '石家庄市': '石家庄',
  '哈尔滨市': '哈尔滨',
  '沈阳市': '沈阳',
  '大连市': '大连',
  '宁波市': '宁波',
  '无锡市': '无锡',
  '佛山市': '佛山',
  '东莞市': '东莞',
  '珠海市': '珠海',
  '惠州市': '惠州',
  '中山市': '中山',
  '汕头市': '汕头',
  '潮州市': '潮州',
  '揭阳市': '揭阳',
  '湛江市': '湛江',
  '温州市': '温州',
  '嘉兴市': '嘉兴',
  '金华市': '金华',
  '台州市': '台州',
  '襄阳市': '襄阳',
  '洛阳市': '洛阳',
  '乌鲁木齐市': '乌鲁木齐',
  '兰州市': '兰州',
  '银川市': '银川',
  '西宁市': '西宁',
  '呼和浩特市': '呼和浩特',
  '拉萨市': '拉萨'
})
const CITY_ADDRESS_MARKERS = Object.freeze(['省', '区', '县', '镇', '乡', '路', '街', '巷', '弄', '号', '室', '栋', '单元', '小区', '楼', '园区'])
const FALSE_LIKE_VALUES = new Set(['', 'false', '0', 'no', 'n', 'off', 'disabled', 'deny', 'denied'])
const TRUE_LIKE_VALUES = new Set(['true', '1', 'yes', 'y', 'on', 'enabled'])
const SAFE_PROVENANCE_VALUES = new Set([
  'first-party',
  'first_party',
  'internal',
  'production',
  'prod',
  'real-user',
  'real_user',
  'user-profile',
  'user_profile',
  'wefinally'
])
const SAFE_EVIDENCE_KEY = /^[a-z][a-z0-9_]*:[a-f0-9]{16,64}$/i
const DOCUMENT_FIELDS = [
  '_id',
  'owner_user_id',
  'evidence_key',
  'category',
  'sanitized_text',
  'tokens',
  'content_hash',
  'chunk_version',
  'retrieval_version',
  'source_profile_version',
  'enabled',
  'updated_at'
]
const COMPARE_FIELDS = DOCUMENT_FIELDS.filter((field) => field !== 'updated_at')

function validUserId(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!/^[1-9]\d*$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function sha256(value, length) {
  const digest = crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
  return length ? digest.slice(0, length) : digest
}

function stableStringify(value) {
  if (value === undefined) return ''
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function normalizeTimestamp(timestamp) {
  if (timestamp !== undefined && timestamp !== null && timestamp !== '') return timestamp
  return new Date().toISOString()
}

function normalizeSafeInput(value) {
  return sanitizeSupplement(value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeControlledInput(value) {
  return normalizeSafeInput(value)
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '')
}

function extractApprovedConcepts(sourceField, value) {
  const text = normalizeSafeInput(value)
  const concepts = FREE_TEXT_CONCEPTS[sourceField]
  if (!text || !concepts) return ''
  const labels = concepts
    .filter((concept) => concept.terms.some((term) => text.includes(term)))
    .map((concept) => concept.label)
  return [...new Set(labels)].join('；')
}

function normalizeControlledValue(sourceField, value) {
  const text = normalizeControlledInput(value)
  const aliases = CONTROLLED_VALUE_ALIASES[sourceField] || []
  const match = aliases.find((item) => item.values.includes(text))
  return match ? match.label : ''
}

function normalizeCityValue(value) {
  const text = normalizeControlledInput(value)
  if (!text || text.length < 2 || text.length > 12) return ''
  if (!/^[\u4e00-\u9fff]+(?:市|自治区|特别行政区)?$/.test(text)) return ''
  if (/[\d０-９]/.test(text) || CITY_ADDRESS_MARKERS.some((marker) => text.includes(marker))) return ''
  if (Object.prototype.hasOwnProperty.call(BROAD_CITY_ALIASES, text)) return BROAD_CITY_ALIASES[text]
  return BROAD_CITY_NAMES.has(text) ? text : ''
}

function normalizeSourceField(sourceField, value) {
  if (!SAFE_SOURCE_FIELDS.has(sourceField)) return ''
  if (sourceField === 'city') return normalizeCityValue(value)
  if (sourceField === 'baby_plan' || sourceField === 'career_family') {
    return normalizeControlledValue(sourceField, value)
  }
  return extractApprovedConcepts(sourceField, value)
}

function normalizeSourceKey(value) {
  return String(value === undefined || value === null ? '' : value)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

function normalizeSourceValue(value) {
  return normalizeSourceKey(value).replace(/[‐‑‒–—−]/g, '-')
}

function isFalseLike(value) {
  if (value === false || value === 0) return true
  if (typeof value !== 'string') return false
  return FALSE_LIKE_VALUES.has(normalizeSourceValue(value))
}

function isTrueLike(value) {
  if (value === true || value === 1) return true
  if (typeof value !== 'string') return false
  return TRUE_LIKE_VALUES.has(normalizeSourceValue(value))
}

function benchmarkExcluded(value) {
  const normalized = normalizeSourceValue(value)
  if (!normalized) return false
  const compact = normalized.replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
  if (compact.includes('speeddatingnativev1') || compact.includes('speed-dating-native-v1')) return true
  if (compact === 'v16' || compact === 'v17' || compact.includes('v16') || compact.includes('v17')) return true
  return /(?:^|[-.:])v?1[-.:]?[67](?:$|[-.:])/.test(normalized)
}

function metadataKey(key) {
  return /(?:source|dataset|manifest|provenance|benchmark|evaluation|fixture|version|corpus|split|schema|origin|metadata)/.test(key)
}

function walkSourceMetadata(value, visitor, context = false, seen = new WeakSet(), key = '') {
  if (value === null || value === undefined) return
  if (typeof value !== 'object') {
    visitor(key, value, context)
    return
  }
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => walkSourceMetadata(item, visitor, context, seen, key))
    return
  }
  Object.keys(value).forEach((rawKey) => {
    const childKey = normalizeSourceKey(rawKey).replace(/-/g, '')
    const childContext = context || metadataKey(childKey)
    visitor(childKey, value[rawKey], childContext)
    walkSourceMetadata(value[rawKey], visitor, childContext, seen, childKey)
  })
}

function provenanceIsExplicitlySafe(value) {
  if (value === null || value === undefined) return false
  if (typeof value !== 'object') return SAFE_PROVENANCE_VALUES.has(normalizeSourceValue(value))
  let explicit = false
  let safe = true
  walkSourceMetadata(value, (key, item, context) => {
    const normalized = normalizeSourceValue(item)
    if (context && (benchmarkExcluded(item)
      || /benchmark|evaluation|external|third[-_]?party|synthetic|fixture|speed[-_]?dating/.test(normalized))) {
      safe = false
    }
    if (/^(?:firstparty|internal|wefinally|trusted|allowlisted)$/.test(key) && isTrueLike(item)) explicit = true
    if (/^(?:firstparty|internal|wefinally|trusted|allowlisted)$/.test(key) && isFalseLike(item)) safe = false
  })
  return safe && explicit
}

function makeEvidenceKey(ownerUserId, category, sourceField, sanitizedText, fallback) {
  if (fallback && sanitizedText === normalizeSafeInput(fallback.sourceText)) return String(fallback.evidenceKey)
  const identity = `${ownerUserId}:${category}:${sourceField || ''}:${sanitizedText}`
  return `${category}:${contentHash(identity)}`
}

function makeDocumentId(ownerUserId, evidenceKey) {
  return `rag_chunk_${sha256(`${ownerUserId}:${evidenceKey}`, 32)}`
}

function sourceProfileVersion(chunks) {
  const identities = chunks
    .map((chunk) => ({
      category: chunk.category,
      evidence_key: chunk.evidence_key,
      content_hash: chunk.content_hash,
      tokens: chunk.tokens
    }))
    .sort((left, right) => left.evidence_key.localeCompare(right.evidence_key))
  return sha256(stableStringify(identities), 40)
}

function isCorpusAllowedSource(user = {}, settings = {}) {
  let allowed = true
  ;[user, settings].forEach((source) => walkSourceMetadata(source, (key, value, context) => {
    if (!allowed) return
    if (key === 'provenance' && !provenanceIsExplicitlySafe(value)) {
      allowed = false
      return
    }
    if (['ragallowed', 'rageligible', 'productiontrainingallowed'].includes(key)) {
      if (isFalseLike(value) || !isTrueLike(value)) allowed = false
      return
    }
    if (/(?:benchmark|fixture)/.test(key)
      || (key.includes('evaluation') && key !== 'evaluationonly')) {
      allowed = false
      return
    }
    if (['evaluationonly', 'sandbox'].includes(key) && isTrueLike(value)) {
      allowed = false
      return
    }
    if (!context) return
    if (benchmarkExcluded(value)) {
      allowed = false
      return
    }
    const normalized = normalizeSourceValue(value)
    if (/benchmark|evaluation|external|third[-_]?party|synthetic|fixture|speed[-_]?dating/.test(normalized)) {
      allowed = false
    }
  }))
  ;[user, settings].forEach((source) => {
    if (!allowed || !source || typeof source !== 'object') return
    Object.keys(source).forEach((rawKey) => {
      if (!allowed) return
      const key = normalizeSourceKey(rawKey).replace(/-/g, '')
      if (key === 'provenance' && !provenanceIsExplicitlySafe(source[rawKey])) allowed = false
    })
  })
  return allowed
}

function normalizeChunk(ownerUserId, rawChunk) {
  if (!rawChunk || typeof rawChunk !== 'object') return null
  const category = String(rawChunk.category || '')
  if (!CHUNK_CATEGORIES.includes(category)) return null
  const sourceField = String(rawChunk.source_field || '')
  if (!SAFE_SOURCE_FIELDS.has(sourceField)) return null
  const originalText = String(rawChunk.sanitized_text || '').trim()
  const sanitizedText = normalizeSourceField(sourceField, originalText)
  if (!sanitizedText) return null
  const usesOriginalIdentity = sanitizedText === normalizeSafeInput(originalText)
  const candidateEvidenceKey = usesOriginalIdentity && rawChunk.evidence_key
    ? String(rawChunk.evidence_key)
    : ''
  const evidenceKey = candidateEvidenceKey
    && SAFE_EVIDENCE_KEY.test(candidateEvidenceKey)
    && candidateEvidenceKey.startsWith(`${category}:`)
    ? candidateEvidenceKey
    : makeEvidenceKey(ownerUserId, category, sourceField, sanitizedText)
  const safeContentHash = contentHash(sanitizedText)
  return {
    owner_user_id: ownerUserId,
    evidence_key: evidenceKey,
    category,
    sanitized_text: sanitizedText,
    tokens: tokenizeSparse(sanitizedText).slice(0, MAX_TOKEN_COUNT),
    content_hash: safeContentHash,
    chunk_version: CHUNK_VERSION,
    retrieval_version: RETRIEVAL_VERSION,
    enabled: true,
    _id: makeDocumentId(ownerUserId, evidenceKey)
  }
}

function projectCorpusDocuments(user = {}, settings = {}, timestamp) {
  const inputUser = user && typeof user === 'object' ? user : {}
  const inputSettings = settings && typeof settings === 'object' ? settings : {}
  const ownerUserId = validUserId(inputUser.id)
  if (ownerUserId === null || !isCorpusAllowedSource(inputUser, inputSettings)) return []
  const sourceChunks = buildEvidenceChunks(Object.assign({}, inputUser, { id: ownerUserId }), inputSettings, normalizeTimestamp(timestamp))
  const chunks = sourceChunks
    .map((chunk) => normalizeChunk(ownerUserId, chunk))
    .filter(Boolean)
  const profileVersion = sourceProfileVersion(chunks)
  const updatedAt = normalizeTimestamp(timestamp)
  return chunks.map((chunk) => Object.assign({}, chunk, {
    source_profile_version: profileVersion,
    updated_at: updatedAt
  }))
}

function assertRepository(repository, required) {
  const methods = required || [
    'listUsersPage',
    'findSetting',
    'listChunksByOwnerIds',
    'upsertChunk',
    'disableChunks'
  ]
  if (!repository || methods.some((name) => typeof repository[name] !== 'function')) {
    throw new Error('RAG 语料 repository 接口不完整')
  }
  return repository
}

function comparableDocument(document) {
  const value = {}
  COMPARE_FIELDS.forEach((field) => {
    value[field] = document && document[field]
  })
  return value
}

function sameDocument(left, right) {
  if (!left || !right) return false
  return stableStringify(comparableDocument(left)) === stableStringify(comparableDocument(right))
    && Object.keys(left).every((key) => DOCUMENT_FIELDS.includes(key))
}

function disabledCount(value) {
  if (typeof value === 'number') return Math.max(0, Number(value) || 0)
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') {
    return Math.max(0, Number(value.disabled || value.updated || value.count || 0) || 0)
  }
  return 0
}

async function syncUserCorpus(user, settings, repository, options = {}) {
  const repo = assertRepository(repository, ['listChunksByOwnerIds', 'upsertChunk', 'disableChunks'])
  const ownerUserId = validUserId(user && user.id)
  if (ownerUserId === null) return { upserted: 0, disabled: 0, source_profile_version: sourceProfileVersion([]) }
  const timestamp = typeof repo.now === 'function' ? repo.now() : new Date().toISOString()
  const forceDisable = options && options.forceDisable === true
  const documents = forceDisable ? [] : projectCorpusDocuments(user, settings, timestamp)
  const existingRows = (await repo.listChunksByOwnerIds([ownerUserId])) || []
  const existingByKey = new Map()
  existingRows.forEach((row) => {
    if (!row || row.evidence_key === undefined) return
    existingByKey.set(String(row.evidence_key), row)
  })
  let upserted = 0
  for (const document of documents) {
    const existing = existingByKey.get(document.evidence_key)
    if (sameDocument(existing, document)) continue
    await repo.upsertChunk(document)
    upserted += 1
  }
  const disabled = disabledCount(await repo.disableChunks(
    ownerUserId,
    documents.map((document) => document.evidence_key)
  ))
  return {
    upserted,
    disabled,
    source_profile_version: documents[0]
      ? documents[0].source_profile_version
      : sourceProfileVersion([])
  }
}

function publicCorpusDocument(row) {
  if (!row || typeof row !== 'object') return null
  const ownerUserId = validUserId(row.owner_user_id)
  if (ownerUserId === null
    || row.enabled !== true
    || row.chunk_version !== CHUNK_VERSION
    || row.retrieval_version !== RETRIEVAL_VERSION) return null
  const category = String(row.category || '')
  const evidenceKey = String(row.evidence_key || '')
  const sourceField = SOURCE_FIELD_BY_CATEGORY[category]
  const rawText = String(row.sanitized_text || '')
  const sanitizedText = normalizeSourceField(sourceField, rawText)
  if (!CHUNK_CATEGORIES.includes(category)
    || !SAFE_EVIDENCE_KEY.test(evidenceKey)
    || !evidenceKey.startsWith(`${category}:`)
    || !sanitizedText
    || sanitizedText !== rawText) return null
  const tokens = tokenizeSparse(sanitizedText).slice(0, MAX_TOKEN_COUNT)
  const sourceVersion = String(row.source_profile_version || '')
  const safeContentHash = contentHash(sanitizedText)
  const updatedAt = row.updated_at instanceof Date
    ? row.updated_at
    : (typeof row.updated_at === 'string' && row.updated_at.length <= 40 ? row.updated_at : undefined)
  return {
    _id: makeDocumentId(ownerUserId, evidenceKey),
    owner_user_id: ownerUserId,
    evidence_key: evidenceKey,
    category,
    sanitized_text: sanitizedText,
    tokens,
    content_hash: safeContentHash,
    chunk_version: String(row.chunk_version || ''),
    retrieval_version: RETRIEVAL_VERSION,
    source_profile_version: /^[a-f0-9]{40}$/i.test(sourceVersion) ? sourceVersion : '',
    enabled: true,
    updated_at: updatedAt
  }
}

async function loadCorpusForUserIds(userIds, repository) {
  const repo = assertRepository(repository, ['listChunksByOwnerIds'])
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds])
    .map(validUserId)
    .filter((id) => id !== null))]
  const result = {}
  ids.forEach((id) => { result[String(id)] = [] })
  if (!ids.length) return result
  const rows = (await repo.listChunksByOwnerIds(ids)) || []
  rows.map(publicCorpusDocument)
    .filter((row) => row && ids.includes(row.owner_user_id))
    .sort((left, right) => left.owner_user_id - right.owner_user_id
      || left.evidence_key.localeCompare(right.evidence_key))
    .forEach((row) => { result[String(row.owner_user_id)].push(row) })
  return result
}

function optionNumber(options, keys, fallback) {
  for (const key of keys) {
    if (options && options[key] !== undefined && options[key] !== null && options[key] !== '') {
      const number = Number(options[key])
      if (Number.isFinite(number)) return number
    }
  }
  return fallback
}

function isEligibleUser(user, settings, documents) {
  if (!user || validUserId(user.id) === null || !documents.length) return false
  if (user.status !== 1) return false
  const declaredMemberStatuses = [user.memberStatus, user.member_status]
    .filter((value) => value !== undefined && value !== null && value !== '')
  if (!declaredMemberStatuses.length
    || declaredMemberStatuses.some((value) => String(value) !== MEMBER_STATUS.APPROVED)) return false
  if (user.match_eligible !== undefined && Number(user.match_eligible) !== 1) return false
  return canEnterFormalCandidatePool(user) && isCorpusAllowedSource(user, settings)
}

function userIdForCursor(user) {
  return validUserId(user && user.id)
}

async function backfillCorpus(options = {}, repository) {
  const input = options && typeof options === 'object' ? options : {}
  const dryRun = input.dry_run === true || input.dryRun === true
  const repo = assertRepository(repository, dryRun
    ? ['listUsersPage', 'findSetting']
    : ['listUsersPage', 'findSetting', 'listChunksByOwnerIds', 'upsertChunk', 'disableChunks'])
  let cursor = optionNumber(input, ['cursor', 'afterId', 'after_id'], 0)
  if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0
  const requestedPages = optionNumber(input, ['page_limit', 'pageLimit', 'maxPages', 'max_page_count'], 1)
  const pageLimit = Math.max(1, Math.min(MAX_PAGE_COUNT, Math.floor(requestedPages)))
  let scanned = 0
  let eligible = 0
  let written = 0
  let disabled = 0
  let nextCursor = null
  let hasMore = false
  for (let page = 0; page < pageLimit; page += 1) {
    // Read one look-ahead row so an exactly full page can still terminate
    // without an extra empty-page request. Only the first PAGE_SIZE users are
    // processed; the extra row is a continuation signal.
    const users = (await repo.listUsersPage({ afterId: cursor, limit: PAGE_SIZE + 1 })) || []
    if (!users.length) {
      nextCursor = null
      hasMore = false
      break
    }
    const orderedUsers = users
      .slice()
      .sort((left, right) => (userIdForCursor(left) || Number.MAX_SAFE_INTEGER) - (userIdForCursor(right) || Number.MAX_SAFE_INTEGER))
      .filter((user) => (userIdForCursor(user) || 0) > cursor)
      .slice(0, PAGE_SIZE)
    const hasLookahead = users.length > PAGE_SIZE
    if (!orderedUsers.length) {
      nextCursor = null
      hasMore = false
      break
    }
    for (const user of orderedUsers) {
      const userId = userIdForCursor(user)
      if (userId === null) continue
      scanned += 1
      const settings = (await repo.findSetting(userId)) || {}
      const documents = projectCorpusDocuments(user, settings, typeof repo.now === 'function' ? repo.now() : undefined)
      const eligibleUser = isEligibleUser(user, settings, documents)
      if (eligibleUser) eligible += 1
      if (dryRun) continue
      // Every valid owner is synchronized. A revoked, non-formal, or empty
      // profile therefore tombstones historical chunks instead of leaving a
      // stale searchable record behind.
      const outcome = await syncUserCorpus(user, settings, repo, { forceDisable: !eligibleUser })
      written += Number(outcome.upserted || 0)
      disabled += Number(outcome.disabled || 0)
    }
    const pageCursor = userIdForCursor(orderedUsers[orderedUsers.length - 1])
    cursor = pageCursor
    if (!hasLookahead) {
      nextCursor = null
      hasMore = false
      break
    }
    nextCursor = pageCursor
    hasMore = true
  }
  const result = {
    scanned,
    eligible,
    written,
    disabled,
    dry_run: dryRun,
    next_cursor: nextCursor
  }
  if (hasMore) result.has_more = true
  return result
}

module.exports = {
  CORPUS_COLLECTION,
  CHUNK_VERSION,
  PAGE_SIZE,
  MAX_PAGE_COUNT,
  RETRIEVAL_VERSION,
  projectCorpusDocuments,
  syncUserCorpus,
  loadCorpusForUserIds,
  isEligibleUser,
  backfillCorpus,
  sourceProfileVersion,
  makeDocumentId,
  isCorpusAllowedSource
}
