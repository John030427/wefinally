const crypto = require('crypto')
const { compileIntentProfile, INTENT_PROFILE_VERSION } = require('./intentProfile')
const { summarizeIdentities } = require('./userIdentityTags')
const { resolveRegion } = require('./regionNormalize')

const AI_MATCH_PROFILE_VERSION = 'ai_match_profile_v1'
const SOURCE_KINDS = {
  USER_DECLARED: 'USER_DECLARED',
  AI_INFERRED: 'AI_INFERRED',
  USER_CORRECTION: 'USER_CORRECTION'
}

const MEANINGFUL_SOURCE_KEYS = [
  'self_view_text',
  'target_view_text',
  'other_requirements',
  'appearance_want',
  'baby_plan',
  'like_baby_plan',
  'min_education',
  'education',
  'city',
  'province_code',
  'city_code',
  'circle_id',
  'primary_circle_id',
  'secondary_circle_ids',
  'psych_profile_json',
  'marry_status',
  'like_marry_status',
  'height_range',
  'income_range',
  'house_car',
  'appearance_description'
]

function stableStringify(value) {
  if (value == null) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${key}:${stableStringify(value[key])}`).join(',')}}`
}

function sourceFingerprint(source = {}) {
  const payload = {}
  for (const key of MEANINGFUL_SOURCE_KEYS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      payload[key] = source[key]
    }
  }
  if (Array.isArray(source.secondary_circle_ids)) {
    payload.secondary_circle_ids = source.secondary_circle_ids.slice().map(Number).sort((a, b) => a - b)
  }
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 40)
}

function taggedItem(value, kind, confidence, evidenceKey) {
  return {
    value,
    kind,
    confidence: Number(confidence),
    evidence_key: evidenceKey || '',
    can_become_hard_gate: kind === SOURCE_KINDS.USER_DECLARED && Number(confidence) >= 0.9
  }
}

function buildNeedsAndOffers(input = {}, intent) {
  const needs = []
  const canOffer = []
  const flexible = []

  for (const item of intent.must_have || []) {
    needs.push(taggedItem(item.value, SOURCE_KINDS.USER_DECLARED, item.confidence || 0.95, item.evidence))
  }
  for (const item of intent.preferences || []) {
    needs.push(taggedItem(item.value, SOURCE_KINDS.USER_DECLARED, item.confidence || 0.9, item.evidence))
  }
  for (const item of intent.deal_breakers || []) {
    needs.push(taggedItem(`避免：${item.value}`, SOURCE_KINDS.USER_DECLARED, item.confidence || 0.95, item.evidence))
  }

  if (input.self_view_text || input.my_values) {
    canOffer.push(taggedItem(
      String(input.self_view_text || input.my_values).slice(0, 80),
      SOURCE_KINDS.USER_DECLARED,
      0.9,
      'values.self_view'
    ))
  }
  if (input.education) {
    canOffer.push(taggedItem(`学历：${input.education}`, SOURCE_KINDS.USER_DECLARED, 0.95, 'profile.education'))
  }
  if (input.baby_plan) {
    canOffer.push(taggedItem(`婚育节奏：${input.baby_plan}`, SOURCE_KINDS.USER_DECLARED, 0.95, 'profile.baby_plan'))
  }

  const identities = summarizeIdentities(input.identity_tags || [])
  if (identities.primary_circle_id || identities.secondary_circle_ids.length) {
    canOffer.push(taggedItem(
      `身份背景：主${identities.primary_circle_id}` + (identities.secondary_circle_ids.length
        ? `；兼${identities.secondary_circle_ids.join(',')}`
        : ''),
      SOURCE_KINDS.USER_DECLARED,
      0.9,
      'profile.identity_tags'
    ))
  }

  for (const item of intent.values || []) {
    if (Number(item.confidence || 0) < 0.85) {
      flexible.push(taggedItem(item.value, SOURCE_KINDS.AI_INFERRED, item.confidence || 0.6, item.evidence))
    }
  }
  for (const item of intent.lifestyle || []) {
    if (Number(item.confidence || 0) < 0.85) {
      flexible.push(taggedItem(item.value, SOURCE_KINDS.AI_INFERRED, item.confidence || 0.55, item.evidence))
    }
  }

  return { needs, can_offer: canOffer, flexible_preferences: flexible }
}

function buildConfidenceMap(intent, needsOffers) {
  return {
    overall: Number(intent.profile_confidence || intent.confidence || 0.5),
    values: averageConfidence(intent.values),
    needs: averageConfidence(needsOffers.needs),
    can_offer: averageConfidence(needsOffers.can_offer),
    lifestyle: averageConfidence(intent.lifestyle),
    deal_breakers: averageConfidence(intent.deal_breakers)
  }
}

function averageConfidence(list = []) {
  if (!list.length) return 0
  const total = list.reduce((sum, item) => sum + Number(item.confidence || 0), 0)
  return Math.round((total / list.length) * 100) / 100
}

function compileAiMatchProfile(input = {}, options = {}) {
  const intent = options.intent || compileIntentProfile(input)
  const region = resolveRegion(input)
  const needsOffers = buildNeedsAndOffers(input, intent)
  const confidence = buildConfidenceMap(intent, needsOffers)
  const fingerprint = sourceFingerprint(input)
  const now = options.now || new Date().toISOString()

  const psych = typeof input.psych_profile_json === 'string'
    ? safeJson(input.psych_profile_json)
    : (input.psych_profile_json || {})

  const profile = {
    schema_version: AI_MATCH_PROFILE_VERSION,
    intent_profile_version: INTENT_PROFILE_VERSION,
    status: 'ready',
    source_of_truth: 'raw_profile',
    source_profile_version: fingerprint,
    profile_version: Number(options.profile_version || 1),
    generated_at: now,
    model: options.model || 'deterministic_compiler',
    provider: options.provider || 'local',
    confirmed_by_user: Boolean(options.confirmed_by_user || intent.mode === 'automatic' && options.auto_confirm !== false),
    relationship_goal: taggedItem(
      psych.marriage_pace || '长期稳定关系',
      psych.marriage_pace ? SOURCE_KINDS.USER_DECLARED : SOURCE_KINDS.AI_INFERRED,
      psych.marriage_pace ? 0.9 : 0.45,
      'psych.marriage_pace'
    ),
    marriage_pace: taggedItem(
      psych.marriage_pace || '',
      psych.marriage_pace ? SOURCE_KINDS.USER_DECLARED : SOURCE_KINDS.AI_INFERRED,
      psych.marriage_pace ? 0.9 : 0.4,
      'psych.marriage_pace'
    ),
    values: (intent.values || []).map((item) => taggedItem(
      item.value,
      Number(item.confidence || 0) >= 0.85 ? SOURCE_KINDS.USER_DECLARED : SOURCE_KINDS.AI_INFERRED,
      item.confidence || 0.7,
      item.evidence
    )),
    needs: needsOffers.needs,
    can_offer: needsOffers.can_offer,
    dealbreakers: (intent.deal_breakers || []).map((item) => taggedItem(
      item.value,
      SOURCE_KINDS.USER_DECLARED,
      item.confidence || 0.95,
      item.evidence
    )),
    flexible_preferences: needsOffers.flexible_preferences,
    communication_style: psych.conflict_style
      ? [taggedItem(psych.conflict_style, SOURCE_KINDS.USER_DECLARED, 0.9, 'psych.conflict_style')]
      : [],
    lifestyle_preferences: (intent.lifestyle || []).map((item) => taggedItem(
      item.value,
      Number(item.confidence || 0) >= 0.85 ? SOURCE_KINDS.USER_DECLARED : SOURCE_KINDS.AI_INFERRED,
      item.confidence || 0.65,
      item.evidence
    )),
    career_orientation: taggedItem(
      psych.career_family || '',
      psych.career_family ? SOURCE_KINDS.USER_DECLARED : SOURCE_KINDS.AI_INFERRED,
      psych.career_family ? 0.9 : 0.4,
      'psych.career_family'
    ),
    family_orientation: taggedItem(
      psych.family_boundary || '',
      psych.family_boundary ? SOURCE_KINDS.USER_DECLARED : SOURCE_KINDS.AI_INFERRED,
      psych.family_boundary ? 0.9 : 0.4,
      'psych.family_boundary'
    ),
    location: {
      ...region,
      kind: SOURCE_KINDS.USER_DECLARED,
      confidence: region.normalized ? 0.95 : 0.7
    },
    education: taggedItem(input.education || '', SOURCE_KINDS.USER_DECLARED, 0.95, 'profile.education'),
    identities: summarizeIdentities(input.identity_tags || [{
      circle_id: input.circle_id || input.primary_circle_id || 0,
      is_primary: true
    }]),
    uncertainties: intent.uncertainties || [],
    contradictions: intent.contradictions || [],
    clarification_questions: intent.clarification_questions || [],
    confidence,
    evidence: intent.evidence || [],
    intent_profile: intent,
    hard_gate_policy: {
      only_user_declared_high_confidence: true,
      ai_inferred_cannot_become_hard_gate: true
    }
  }

  let result = profile
  for (const correction of options.corrections || []) {
    result = applyAiProfileCorrection(result, correction, { now: options.correctionNow || now })
  }
  return result
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    return {}
  }
}

function shouldInvalidateAiMatchProfile(existingProfile, source = {}) {
  if (!existingProfile) return true
  const next = sourceFingerprint(source)
  const previous = String(
    existingProfile.source_profile_version
    || existingProfile.sourceProfileVersion
    || ''
  )
  return !previous || previous !== next
}

function applyAiProfileCorrection(profile = {}, correction = {}, options = {}) {
  const text = String(correction && correction.text || '').trim()
  if (!text) throw new Error('纠正内容不能为空')
  if (text.length > 200) throw new Error('纠正内容最多200字')
  const existing = profile && typeof profile === 'object' ? profile : {}
  const now = options.now || new Date().toISOString()
  const next = JSON.parse(JSON.stringify(existing))
  if (!next.flexible_preferences) next.flexible_preferences = []
  if (!next.corrections) next.corrections = []
  if (!next.evidence) next.evidence = []
  const count = Number(next.correction_count || next.corrections.length || 0)
  const evidenceKey = `user_correction.${count + 1}`
  const item = {
    value: text,
    kind: SOURCE_KINDS.USER_CORRECTION,
    confidence: 0.95,
    evidence_key: evidenceKey,
    can_become_hard_gate: false
  }
  next.flexible_preferences.push(item)
  next.corrections.push(Object.assign({}, item, { created_at: now, source: 'user_correction' }))
  next.evidence.push({
    key: evidenceKey,
    kind: SOURCE_KINDS.USER_CORRECTION,
    source: 'user_correction',
    text,
    confidence: 0.95,
    created_at: now
  })
  next.correction_count = count + 1
  next.last_correction_at = now
  next.patched_from_version = Number(existing.profile_version || 1)
  next.profile_version = Number(existing.profile_version || 1) + 1
  next.confirmed_by_user = true
  next.status = 'ready'
  next.patch_applied = true
  next.generated_at = now
  next.source_profile_version = String(existing.source_profile_version || '')
  return next
}

function extractHardGateCandidates(profile) {
  const items = []
  const lists = [profile && profile.dealbreakers, profile && profile.needs]
  for (const list of lists) {
    for (const item of list || []) {
      if (item && item.kind === SOURCE_KINDS.USER_DECLARED && item.can_become_hard_gate) {
        items.push(item)
      }
    }
  }
  return items
}

function assertInferredCannotHardGate(profile) {
  for (const item of [...(profile.needs || []), ...(profile.dealbreakers || []), ...(profile.values || [])]) {
    if (item.kind === SOURCE_KINDS.AI_INFERRED && item.can_become_hard_gate) {
      throw new Error('AI_INFERRED item cannot become hard gate')
    }
  }
  return true
}

module.exports = {
  AI_MATCH_PROFILE_VERSION,
  SOURCE_KINDS,
  MEANINGFUL_SOURCE_KEYS,
  sourceFingerprint,
  compileAiMatchProfile,
  shouldInvalidateAiMatchProfile,
  applyAiProfileCorrection,
  extractHardGateCandidates,
  assertInferredCannotHardGate
}
