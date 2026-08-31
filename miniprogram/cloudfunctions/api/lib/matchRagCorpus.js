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

const CORPUS_COLLECTION = 'user_evidence_chunk'
const CHUNK_VERSION = CHUNK_SCHEMA_VERSION
const PAGE_SIZE = 20
const MAX_PAGE_COUNT = 10
const MAX_TOKEN_COUNT = 1200
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
  let text = sanitizeSupplement(value)
  // `buildEvidenceChunks` already removes direct identifiers. Keep this final
  // corpus boundary narrow as well so free-text salary and employer details do
  // not become retrievable if they appear in a user-entered supplement.
  text = text
    .replace(/(?:月收入|年收入|月薪|年薪|薪资|工资|收入)\s*[:：]?\s*[\d,.，。万千百十元人民币+\-~至到]{1,40}/gi, '[已脱敏]')
    .replace(/[^，。；;！？!?]{0,40}(?:雇主|公司|单位)(?:[^，。；;！？!?]{0,60})/gi, '[已脱敏]')
    .replace(/(?:任职于|就职于|工作于)\s*[:：]?\s*[^，。；;！？!?]{1,60}/gi, '[已脱敏]')
    .replace(/(?:中国|[\u4e00-\u9fa5]{1,10}(?:省|市|区|县|镇|乡))[^，。；;！？!?]{0,40}\d{1,6}(?:号|弄|室|栋|单元)?/g, '[已脱敏]')
    .replace(/\s+/g, ' ')
    .trim()
  return text
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

function benchmarkExcluded(value) {
  return /speed[-_ ]dating[-_]native[-_]v1|(?:^|[._-])v?1[._-]?(?:6|7)(?:$|[._-])/i.test(String(value || ''))
}

function isCorpusAllowedSource(user = {}, settings = {}) {
  if (user.rag_allowed === false || settings.rag_allowed === false) return false
  if (user.rag_eligible === false || settings.rag_eligible === false) return false
  if (user.production_training_allowed === false || settings.production_training_allowed === false) return false
  if (user.evaluation_only === true || settings.evaluation_only === true) return false
  if (user.sandbox === true || settings.sandbox === true) return false
  const metadata = [
    user.source_dataset,
    user.source,
    user.source_id,
    user.data_source,
    user.dataset,
    user.dataset_name,
    user.dataset_version,
    user.manifest,
    user.manifest_name,
    user.manifest_version,
    user.match_version,
    user.source_version,
    user.profile_version,
    user.rag_version,
    user.schema_version,
    user.benchmark_version,
    user.fixture_key,
    settings.source_dataset,
    settings.source,
    settings.source_id,
    settings.data_source,
    settings.dataset,
    settings.dataset_version,
    settings.manifest,
    settings.manifest_version,
    settings.match_version,
    settings.profile_version,
    settings.rag_version,
    settings.schema_version,
    settings.benchmark_version,
    settings.fixture_key
  ]
  return !metadata.some(benchmarkExcluded)
}

function normalizeChunk(ownerUserId, rawChunk) {
  if (!rawChunk || typeof rawChunk !== 'object') return null
  const category = String(rawChunk.category || '')
  if (!CHUNK_CATEGORIES.includes(category)) return null
  const originalText = String(rawChunk.sanitized_text || '').trim()
  const sanitizedText = redactCorpusText(originalText)
  if (!sanitizedText) return null
  const sourceField = String(rawChunk.source_field || '')
  const usesOriginalIdentity = sanitizedText === originalText
  const evidenceKey = usesOriginalIdentity && rawChunk.evidence_key
    ? String(rawChunk.evidence_key)
    : makeEvidenceKey(ownerUserId, category, sourceField, sanitizedText)
  const safeContentHash = usesOriginalIdentity && rawChunk.content_hash
    ? String(rawChunk.content_hash)
    : contentHash(sanitizedText)
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

async function syncUserCorpus(user, settings, repository) {
  const repo = assertRepository(repository, ['listChunksByOwnerIds', 'upsertChunk', 'disableChunks'])
  const ownerUserId = validUserId(user && user.id)
  if (ownerUserId === null) return { upserted: 0, disabled: 0, source_profile_version: sourceProfileVersion([]) }
  const timestamp = typeof repo.now === 'function' ? repo.now() : new Date().toISOString()
  const documents = projectCorpusDocuments(user, settings, timestamp)
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
    || !evidenceKey
    || /openid|phone|wechat|手机|微信|address|employer|income|vector|embedding/i.test(evidenceKey)
    || !sanitizedText) return null
  const tokens = tokenizeSparse(sanitizedText).slice(0, MAX_TOKEN_COUNT)
  const sourceVersion = String(row.source_profile_version || '')
  const rowContentHash = String(row.content_hash || '')
  const safeContentHash = /^[a-f0-9]{16,64}$/i.test(rowContentHash)
    ? rowContentHash
    : contentHash(sanitizedText)
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
  if (user.status !== undefined && Number(user.status) !== 1) return false
  if (user.member_status !== undefined && String(user.member_status) !== 'approved') return false
  if (user.match_eligible !== undefined && Number(user.match_eligible) !== 1) return false
  return isCorpusAllowedSource(user, settings)
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
  let nextCursor = cursor || null
  for (let page = 0; page < pageLimit; page += 1) {
    const users = (await repo.listUsersPage({ afterId: cursor, limit: PAGE_SIZE })) || []
    if (!users.length) break
    const orderedUsers = users
      .slice()
      .sort((left, right) => (userIdForCursor(left) || Number.MAX_SAFE_INTEGER) - (userIdForCursor(right) || Number.MAX_SAFE_INTEGER))
      .filter((user) => (userIdForCursor(user) || 0) > cursor)
      .slice(0, PAGE_SIZE)
    if (!orderedUsers.length) break
    for (const user of orderedUsers) {
      const userId = userIdForCursor(user)
      if (userId === null) continue
      scanned += 1
      const settings = (await repo.findSetting(userId)) || {}
      const documents = projectCorpusDocuments(user, settings, typeof repo.now === 'function' ? repo.now() : undefined)
      if (!isEligibleUser(user, settings, documents)) continue
      eligible += 1
      if (dryRun) continue
      const outcome = await syncUserCorpus(user, settings, repo)
      written += Number(outcome.upserted || 0)
      disabled += Number(outcome.disabled || 0)
    }
    nextCursor = userIdForCursor(orderedUsers[orderedUsers.length - 1])
    cursor = nextCursor
    if (orderedUsers.length < PAGE_SIZE) break
  }
  return {
    scanned,
    eligible,
    written,
    disabled,
    dry_run: dryRun,
    next_cursor: nextCursor
  }
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
