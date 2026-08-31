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
const SENSITIVE_CORPUS_MARKERS = Object.freeze([
  // Employment and employer details are not a retrieval-safe field.
  '任职',
  '就职',
  '供职',
  '雇主',
  '公司',
  '单位',
  '工作',
  '上班',
  // Keep all salary/income utterances out, including Chinese amount forms.
  '收入',
  '薪资',
  '薪酬',
  '工资',
  '月薪',
  '年薪',
  '月入',
  '年入',
  '人民币',
  '万元',
  '万块',
  '元/月',
  '元／月',
  // Exact residence/address details are not retrieval-safe either.
  '住在',
  '住址',
  '地址',
  '门牌',
  '居住地',
  '小区',
  '路',
  '街',
  '巷',
  '弄',
  '室',
  '栋',
  '单元',
  '门号',
  '号'
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

function redactCorpusText(value) {
  return sanitizeSupplement(value).replace(/\s+/g, ' ').trim()
}

function hasSensitiveCorpusContent(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .normalize('NFKC')
    .toLowerCase()
  return SENSITIVE_CORPUS_MARKERS.some((marker) => text.includes(marker))
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
  return /(?:source|dataset|manifest|provenance|benchmark|evaluation|fixture|version|corpus|split|schema|origin)/.test(key)
}

function walkSourceMetadata(value, visitor, context = false, seen = new WeakSet()) {
  if (value === null || value === undefined) return
  if (typeof value === 'object') {
    if (seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach((item) => walkSourceMetadata(item, visitor, context, seen))
      return
    }
    Object.keys(value).forEach((rawKey) => {
      const key = normalizeSourceKey(rawKey).replace(/-/g, '')
      const childContext = context || metadataKey(key)
      visitor(key, value[rawKey], childContext)
      walkSourceMetadata(value[rawKey], visitor, childContext, seen)
    })
  }
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
  if (fallback && sanitizedText === redactCorpusText(fallback.sourceText)) return String(fallback.evidenceKey)
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
  const sanitizedText = redactCorpusText(originalText)
  if (!sanitizedText || hasSensitiveCorpusContent(originalText) || hasSensitiveCorpusContent(sanitizedText)) return null
  const usesOriginalIdentity = sanitizedText === originalText
  const candidateEvidenceKey = usesOriginalIdentity && rawChunk.evidence_key
    ? String(rawChunk.evidence_key)
    : ''
  const evidenceKey = candidateEvidenceKey && SAFE_EVIDENCE_KEY.test(candidateEvidenceKey)
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
  const sanitizedText = redactCorpusText(row.sanitized_text)
  if (!CHUNK_CATEGORIES.includes(category)
    || !SAFE_EVIDENCE_KEY.test(evidenceKey)
    || !evidenceKey.startsWith(`${category}:`)
    || hasSensitiveCorpusContent(row.sanitized_text)
    || hasSensitiveCorpusContent(sanitizedText)
    || !sanitizedText) return null
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
    const users = (await repo.listUsersPage({ afterId: cursor, limit: PAGE_SIZE })) || []
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
    if (orderedUsers.length < PAGE_SIZE) {
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
  backfillCorpus,
  sourceProfileVersion,
  makeDocumentId,
  isCorpusAllowedSource
}
