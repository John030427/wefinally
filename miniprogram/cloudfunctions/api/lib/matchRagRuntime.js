const KNOWN_MODES = Object.freeze(['off', 'shadow', 'active'])

function normalizeMode(value) {
  return String(value || '').trim().toLowerCase()
}

function isKnownMode(value) {
  return KNOWN_MODES.includes(value)
}

function resolveRagMode(env = process.env) {
  const source = env && typeof env === 'object' ? env : {}
  const value = normalizeMode(source.MATCH_RAG_MODE)
  return isKnownMode(value) ? value : 'off'
}

function candidateIdentity(item) {
  if (!item || typeof item !== 'object') return ''
  const internalId = item.internalUserId === undefined || item.internalUserId === null
    ? ''
    : String(item.internalUserId)
  const candidateId = item.candidate && item.candidate.id !== undefined && item.candidate.id !== null
    ? String(item.candidate.id)
    : ''
  // A row carrying both identifiers must agree. Otherwise an enriched row can
  // smuggle a replacement candidate by pairing a trusted internal id with an
  // attacker-controlled candidate object.
  if (internalId && candidateId && internalId !== candidateId) return ''
  return candidateId || internalId
}

function applyRagMode(mode, originalRanked, enrichedRanked) {
  const original = Array.isArray(originalRanked) ? originalRanked.slice() : []
  const normalizedMode = normalizeMode(mode)
  const resolved = isKnownMode(normalizedMode)
    ? normalizedMode
    : 'off'
  if (resolved !== 'active' || !Array.isArray(enrichedRanked)) return original

  // An enriched result may reorder deterministic candidates but may never add
  // or replace a candidate. Return original rows as the source of truth and
  // copy no candidate, quality, or other enriched payload fields.
  const allowed = new Set(original.map(candidateIdentity).filter(Boolean))
  if (!allowed.size) return original
  const used = new Set()
  const active = []
  for (const item of enrichedRanked) {
    const identity = candidateIdentity(item)
    if (!identity || !allowed.has(identity) || used.has(identity)) continue
    used.add(identity)
    const source = original.find((row) => candidateIdentity(row) === identity)
    if (source) active.push(source)
  }
  for (const item of original) {
    const identity = candidateIdentity(item)
    if (!identity || !used.has(identity)) active.push(item)
  }
  return active.length ? active : original
}

module.exports = {
  KNOWN_MODES,
  resolveRagMode,
  applyRagMode
}
