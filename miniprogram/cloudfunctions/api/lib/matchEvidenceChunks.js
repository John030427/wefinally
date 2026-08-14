const crypto = require('crypto')
const { sanitizeSupplement } = require('./intentProfile')

const CHUNK_SCHEMA_VERSION = 'evidence_chunk_v1'
const CHUNK_CATEGORIES = Object.freeze([
  'values_self',
  'values_target',
  'relationship_style',
  'life_plan',
  'city_plan',
  'marriage_and_baby',
  'appearance_self',
  'appearance_target',
  'other_requirements',
  'deal_breakers'
])

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16)
}

function sanitizeText(value) {
  return sanitizeSupplement(value).replace(/\s+/g, ' ').trim()
}

function parsePsych(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (err) {
    return null
  }
}

function chunk(ownerUserId, category, sourceField, text, now) {
  const sanitized = sanitizeText(text)
  if (!sanitized) return null
  const identityHash = contentHash(`${Number(ownerUserId || 0)}:${category}:${sourceField}:${sanitized}`)
  return {
    evidence_key: `${category}:${identityHash}`,
    owner_user_id: Number(ownerUserId || 0),
    category,
    sanitized_text: sanitized,
    source_field: sourceField,
    content_hash: contentHash(sanitized),
    updated_at: now,
    completeness: Math.min(1, sanitized.length / 40),
    schema_version: CHUNK_SCHEMA_VERSION
  }
}

function buildEvidenceChunks(user = {}, settings = {}, now = new Date().toISOString()) {
  const ownerUserId = Number(user.id || 0)
  const psych = parsePsych(settings.psych_profile_json || user.psych_profile_json)
  const psychText = psych
    ? [
      psych.marriage_pace,
      psych.conflict_style,
      psych.security_space,
      psych.family_boundary,
      psych.money_view,
      psych.career_family
    ].filter(Boolean).join('；')
    : ''

  return [
    chunk(ownerUserId, 'values_self', 'self_view_text', settings.self_view_text, now),
    chunk(ownerUserId, 'values_target', 'target_view_text', settings.target_view_text, now),
    chunk(ownerUserId, 'relationship_style', 'psych_profile_json', psychText, now),
    chunk(ownerUserId, 'life_plan', 'career_family', psych && psych.career_family, now),
    chunk(ownerUserId, 'city_plan', 'city', user.city, now),
    chunk(ownerUserId, 'marriage_and_baby', 'baby_plan', user.baby_plan || settings.like_baby_plan, now),
    chunk(ownerUserId, 'appearance_self', 'appearance_description', user.appearance_description, now),
    chunk(ownerUserId, 'appearance_target', 'appearance_want', user.appearance_want || settings.appearance_want, now),
    chunk(ownerUserId, 'other_requirements', 'other_requirements', settings.other_requirements, now),
    chunk(ownerUserId, 'deal_breakers', 'deal_breakers', settings.deal_breakers, now)
  ].filter(Boolean)
}

module.exports = {
  CHUNK_SCHEMA_VERSION,
  CHUNK_CATEGORIES,
  contentHash,
  buildEvidenceChunks
}
