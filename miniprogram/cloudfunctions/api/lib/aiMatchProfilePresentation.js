/**
 * Human-readable presentation of the versioned AI Match Profile.
 * Deterministic; only safe, explainable content leaves this module.
 * Never exposes raw evidence keys, full identity structures, contact details,
 * or AI-inferred private personality claims.
 */

const { SOURCE_KINDS } = require('./aiMatchProfile')

function clean(value, limit) {
  return String(value || '')
    .replace(/\b1[3-9]\d{9}\b/g, '[已脱敏手机号]')
    .replace(/\b(?:openid|open_id)\s*[:：]?\s*[A-Za-z0-9_-]{8,}\b/gi, '[已隐藏标识]')
    .replace(/\b(?:sk|api)[-_][A-Za-z0-9_-]{8,}\b/gi, '[已隐藏密钥]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit || 120)
}

function itemsOf(list, kinds, limit) {
  return Array.from(new Set((list || [])
    .filter((item) => !kinds || !kinds.length || kinds.includes(item && item.kind))
    .map((item) => clean(item && item.value, 80))
    .filter(Boolean)))
    .slice(0, limit || 8)
}

function presentAiMatchProfile(profile = {}, options = {}) {
  const safe = profile && typeof profile === 'object' ? profile : {}
  const sections = []

  const goal = clean(safe.relationship_goal && safe.relationship_goal.value, 60)
  if (goal) sections.push({ key: 'goal', title: '关系目标', items: [goal] })

  const valued = itemsOf(safe.values, [SOURCE_KINDS.USER_DECLARED], 6)
  const lifestyle = itemsOf(safe.lifestyle_preferences, [SOURCE_KINDS.USER_DECLARED], 4)
  if (valued.length || lifestyle.length) {
    sections.push({ key: 'valued', title: '比较看重的关系特征', items: valued.concat(lifestyle).slice(0, 8) })
  }

  const requirementsText = itemsOf(safe.needs, [SOURCE_KINDS.USER_DECLARED], 6)
  const dealbreakers = itemsOf(safe.dealbreakers, [SOURCE_KINDS.USER_DECLARED], 4)
  if (requirementsText.length || dealbreakers.length) {
    sections.push({ key: 'partner_offers', title: '希望对方能够提供什么', items: requirementsText.concat(dealbreakers).slice(0, 8) })
  }

  const myOffers = itemsOf(safe.can_offer, [SOURCE_KINDS.USER_DECLARED], 6)
  if (myOffers.length) sections.push({ key: 'my_offers', title: '自己能够提供什么', items: myOffers })

  const flexible = itemsOf(safe.flexible_preferences, [], 6)
    .concat(itemsOf(safe.values, [SOURCE_KINDS.AI_INFERRED], 2))
    .concat(itemsOf(safe.lifestyle_preferences, [SOURCE_KINDS.AI_INFERRED], 2))
  const flexibleClean = [...new Set(flexible)].slice(0, 8)
  if (flexibleClean.length) {
    sections.push({ key: 'flexible', title: '可能比较灵活的条件（AI推测，未硬性要求）', items: flexibleClean })
  }

  const corrections = itemsOf(safe.corrections, [], 6)
  if (corrections.length) {
    sections.push({ key: 'corrections', title: '你补充的纠正', items: corrections })
  }

  const confidence = safe.confidence && typeof safe.confidence === 'object' ? safe.confidence : {}
  return {
    disclaimer: 'AI 生成内容，仅供参考',
    schema_version: String(safe.schema_version || ''),
    profile_version: Number(safe.profile_version || 1),
    confirmed_by_user: Boolean(safe.confirmed_by_user),
    correction_count: Number(safe.correction_count || (safe.corrections && safe.corrections.length) || 0),
    source_profile_version: String(safe.source_profile_version || '').slice(0, 40),
    generated_at: safe.generated_at || null,
    overall_confidence: Number(confidence.overall || 0),
    sections
  }
}

module.exports = {
  presentAiMatchProfile,
  clean
}
