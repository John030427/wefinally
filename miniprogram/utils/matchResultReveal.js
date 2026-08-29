function profileIdentity(profile = {}) {
  return String(profile.id || profile.support_code || profile.supportCode || '').trim()
}

function seenStorageKey(profile = {}) {
  const identity = profileIdentity(profile).replace(/[^A-Za-z0-9_-]/g, '')
  return identity ? `wf_match_reveal_seen_${identity}` : ''
}

function dateStamp(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return Number(`${match[1]}${match[2]}${match[3]}`)
}

function localDateStamp(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return Number(`${year}${month}${day}`)
}

function shouldRevealLatestMatch({ latest, seenMatchId, now = new Date() } = {}) {
  if (!latest || (!latest.id && !latest.matchId)) return false
  const matchId = String(latest.id || latest.matchId)
  if (String(seenMatchId || '') === matchId) return false
  const matchDay = dateStamp(latest.matchDate || latest.match_date)
  if (!matchDay) return false
  return matchDay <= localDateStamp(now)
}

module.exports = {
  seenStorageKey,
  shouldRevealLatestMatch
}
