const KNOWN_MODES = Object.freeze(new Set(['off', 'shadow', 'active']))

function resolveRagMode(env = process.env) {
  const source = env && typeof env === 'object' ? env : {}
  const value = String(source.MATCH_RAG_MODE || '').trim().toLowerCase()
  return KNOWN_MODES.has(value) ? value : 'off'
}

function candidateIdentity(item) {
  if (!item || typeof item !== 'object') return ''
  if (item.internalUserId !== undefined && item.internalUserId !== null) return String(item.internalUserId)
  if (item.candidate && item.candidate.id !== undefined && item.candidate.id !== null) return String(item.candidate.id)
  return ''
}

function applyRagMode(mode, originalRanked, enrichedRanked) {
  const original = Array.isArray(originalRanked) ? originalRanked.slice() : []
  const resolved = KNOWN_MODES.has(String(mode || '').trim().toLowerCase())
    ? String(mode || '').trim().toLowerCase()
    : 'off'
  if (resolved !== 'active' || !Array.isArray(enrichedRanked)) return original

  // An enriched result may reorder deterministic candidates but may never add
  // a candidate. Preserve canonical rows missing from a partial enrichment.
  const allowed = new Set(original.map(candidateIdentity).filter(Boolean))
  if (!allowed.size) return original
  const used = new Set()
  const active = []
  for (const item of enrichedRanked) {
    const identity = candidateIdentity(item)
    if (!identity || !allowed.has(identity) || used.has(identity)) continue
    used.add(identity)
    active.push(item)
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
