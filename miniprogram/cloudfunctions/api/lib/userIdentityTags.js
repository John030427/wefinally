/**
 * Multi-identity tags: 1 primary + up to 2 secondary.
 * Partner / promoter attribution stays on user.promote_partner_id — never derived from identities.
 */

const MAX_TOTAL_IDENTITIES = 3
const MAX_SECONDARY = 2

function toInt(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function normalizeIdentityInput(input = {}) {
  const primaryCircleId = toInt(input.primary_circle_id != null ? input.primary_circle_id : input.circle_id, NaN)
  if (!Number.isFinite(primaryCircleId)) {
    throw new Error('请选择主要身份')
  }

  const secondaryRaw = input.secondary_circle_ids || input.secondaryCircleIds || input.identity_circle_ids || []
  const secondaryList = Array.isArray(secondaryRaw)
    ? secondaryRaw
    : String(secondaryRaw || '').split(',').map((item) => item.trim()).filter(Boolean)

  const secondaryIds = []
  for (const item of secondaryList) {
    const id = toInt(item, NaN)
    if (!Number.isFinite(id)) continue
    if (id === primaryCircleId) continue
    if (secondaryIds.includes(id)) continue
    secondaryIds.push(id)
    if (secondaryIds.length >= MAX_SECONDARY) break
  }

  const occupationDescription = String(
    input.occupation_description || input.occupationDescription || ''
  ).trim().slice(0, 100)

  if (primaryCircleId === 0 && !occupationDescription) {
    throw new Error('选择“其他”时请填写职业说明')
  }

  const tags = [
    {
      circle_id: primaryCircleId,
      is_primary: true,
      source: 'user_declared',
      verified_status: 'unverified',
      occupation_description: primaryCircleId === 0 ? occupationDescription : ''
    },
    ...secondaryIds.map((circleId) => ({
      circle_id: circleId,
      is_primary: false,
      source: 'user_declared',
      verified_status: 'unverified',
      occupation_description: ''
    }))
  ]

  if (tags.length > MAX_TOTAL_IDENTITIES) {
    throw new Error(`身份标签最多 ${MAX_TOTAL_IDENTITIES} 个`)
  }

  return {
    primary_circle_id: primaryCircleId,
    secondary_circle_ids: secondaryIds,
    circle_id: primaryCircleId,
    occupation_description: primaryCircleId === 0 ? occupationDescription : '',
    tags,
    // Explicit: identity multiplicity must never imply multi-partner attribution
    attribution_unaffected: true
  }
}

function legacyTagsFromUser(user = {}) {
  const circleId = toInt(user.circle_id, 0)
  return [{
    circle_id: circleId,
    is_primary: true,
    source: 'legacy_backfill',
    verified_status: 'unverified',
    occupation_description: circleId === 0
      ? String(user.occupation_description || '').trim().slice(0, 100)
      : ''
  }]
}

function summarizeIdentities(tags = []) {
  const list = Array.isArray(tags) ? tags : []
  const primary = list.find((item) => item && (item.is_primary === true || item.is_primary === 1)) || list[0] || null
  const secondary = list.filter((item) => item && item !== primary && !(item.is_primary === true || item.is_primary === 1))
  return {
    primary_circle_id: primary ? toInt(primary.circle_id, 0) : 0,
    secondary_circle_ids: secondary.map((item) => toInt(item.circle_id, 0)),
    circle_ids: list.map((item) => toInt(item.circle_id, 0)),
    tags: list
  }
}

function identityOverlapScore(aTags = [], bTags = {}) {
  const a = summarizeIdentities(Array.isArray(aTags) ? aTags : (aTags.tags || []))
  const b = summarizeIdentities(Array.isArray(bTags) ? bTags : (bTags.tags || []))
  const aSet = new Set(a.circle_ids.map(String))
  const bSet = new Set(b.circle_ids.map(String))
  if (!aSet.size || !bSet.size) {
    return { score: null, shared: [], compared: false, note: 'missing_identity' }
  }
  const shared = [...aSet].filter((id) => bSet.has(id) && id !== '0')
  const union = new Set([...aSet, ...bSet])
  const jaccard = shared.length / Math.max(1, union.size)
  // Partial overlap is contextual evidence, not hard equality requirement
  return {
    score: Math.round(jaccard * 100),
    shared,
    compared: true,
    primary_same: String(a.primary_circle_id) === String(b.primary_circle_id),
    note: shared.length ? 'partial_or_full_overlap' : 'no_shared_identity'
  }
}

module.exports = {
  MAX_TOTAL_IDENTITIES,
  MAX_SECONDARY,
  normalizeIdentityInput,
  legacyTagsFromUser,
  summarizeIdentities,
  identityOverlapScore
}
