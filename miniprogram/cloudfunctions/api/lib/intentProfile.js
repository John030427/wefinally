const INTENT_PROFILE_VERSION = 'intent_profile_v1'
const MAX_SUPPLEMENT_LENGTH = 500
const MAX_EVIDENCE_LENGTH = 120

const KEYWORD_GROUPS = {
  values: ['真诚', '责任', '尊重', '边界', '稳定', '沟通', '包容', '坦诚'],
  lifestyle: ['城市', '生活', '规划', '事业', '家庭', '通勤', '旅行', '运动', '作息'],
  appearance: ['外貌', '气质', '干净', '清爽', '自然', '运动', '阳光', '文艺', '成熟', '温柔'],
  uncertainty: ['不确定', '待定', '再看看', '可能', '还没想好', '视情况']
}

function normalizeMode(value) {
  const mode = String(value || process.env.AI_INTENT_CONFIRMATION_MODE || 'automatic').trim().toLowerCase()
  return mode === 'confirm' ? 'confirm' : 'automatic'
}

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/(?:手机号|手机|电话|微信号|微信|联系方式)\s*[:：]?\s*[A-Za-z0-9_+\-]{4,}/gi, '[已脱敏]')
    .replace(/\b1[3-9]\d{9}\b/g, '[已脱敏]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[已脱敏]')
    .replace(/\b(?:openid|unionid|session[_ -]?key|token)\b\s*[:：=]?\s*[A-Za-z0-9_\-]{6,}/gi, '[已脱敏]')
    .replace(/\b\d{6,}\b/g, '[已脱敏]')
    .replace(/(?:路|街|巷|道)\d{1,4}(?:号|弄)\d{0,4}/g, '[已脱敏]')
}

function sanitizeSupplement(value) {
  return redactSensitiveText(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, MAX_SUPPLEMENT_LENGTH)
}

function normalizedText(value, maxLength) {
  return redactSensitiveText(value).replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function hasKeyword(text, keyword) {
  return String(text || '').includes(keyword)
}

function matchedKeywords(text, keywords) {
  return keywords.filter((keyword) => hasKeyword(text, keyword))
}

function evidenceItem(key, source, text, strength, confidence) {
  return {
    key,
    source,
    excerpt: normalizedText(text, MAX_EVIDENCE_LENGTH),
    strength,
    confidence
  }
}

function inferredItems(values, evidenceKey, strength, confidence) {
  return values.map((value) => ({
    value,
    evidence: evidenceKey,
    strength,
    confidence
  }))
}

function compileIntentProfile(input = {}) {
  const mode = normalizeMode(input.mode)
  const supplement = sanitizeSupplement(input.other_requirements || input.otherRequirements)
  const selfValues = normalizedText(input.self_view_text || input.my_values, 300)
  const targetValues = normalizedText(input.target_view_text || input.expect_values, 300)
  const appearance = normalizedText(input.appearance_want, 300)
  const combined = [selfValues, targetValues, supplement].filter(Boolean).join('；')

  const values = matchedKeywords(`${selfValues}；${targetValues}`, KEYWORD_GROUPS.values)
  const lifestyle = matchedKeywords(`${combined}；${input.city || ''}；${input.baby_plan || ''}`, KEYWORD_GROUPS.lifestyle)
  const appearancePreferences = matchedKeywords(`${appearance}；${supplement}`, KEYWORD_GROUPS.appearance)
  const uncertainties = matchedKeywords(combined, KEYWORD_GROUPS.uncertainty)
  const contradictions = []
  if (/(不要|不考虑)/.test(targetValues) && /(希望|重视)/.test(selfValues) && /孩子|婚育/.test(`${selfValues}${targetValues}`)) {
    contradictions.push('婚育表达存在方向差异，需由用户确认')
  }

  const evidence = []
  if (selfValues) evidence.push(evidenceItem('values.self_view', 'self_view_text', selfValues, 'explicit', 0.9))
  if (targetValues) evidence.push(evidenceItem('values.target_view', 'target_view_text', targetValues, 'explicit', 0.9))
  if (supplement) evidence.push(evidenceItem('supplement', 'other_requirements', supplement, 'explicit', 0.85))
  if (input.city) evidence.push(evidenceItem('lifestyle.city', 'profile.city', input.city, 'structured', 0.95))
  if (input.baby_plan) evidence.push(evidenceItem('lifestyle.baby_plan', 'profile.baby_plan', input.baby_plan, 'structured', 0.95))
  if (appearance) evidence.push(evidenceItem('appearance', 'appearance_want', appearance, 'explicit', 0.85))

  const clarificationQuestions = []
  if (uncertainties.length) clarificationQuestions.push('哪些补充要求是必须满足的，哪些可以协商？')
  if (contradictions.length) clarificationQuestions.push('婚育与长期生活规划的优先顺序是否需要进一步确认？')
  if (!supplement && !appearance) clarificationQuestions.push('是否还有未被结构化问题覆盖的生活方式或气质偏好？')

  const confidence = Math.min(0.95, Math.max(0.35, 0.35 + evidence.length * 0.1))
  return {
    mode,
    requires_confirmation: mode === 'confirm',
    must_have: [],
    preferences: inferredItems([
      input.min_education ? `学历不低于${input.min_education}` : '',
      input.like_baby_plan ? `婚育节奏：${input.like_baby_plan}` : ''
    ].filter(Boolean), 'structured_preferences', 'explicit', 0.95),
    values: inferredItems(values, 'values.self_view', 'explicit', 0.85),
    lifestyle: inferredItems(lifestyle, 'lifestyle', 'explicit', 0.8),
    appearance_preferences: inferredItems(appearancePreferences, 'appearance', 'explicit', 0.8),
    deal_breakers: [],
    uncertainties: inferredItems(uncertainties, 'uncertainty', 'explicit', 0.75),
    contradictions: inferredItems(contradictions, 'contradiction', 'derived', 0.55),
    clarification_questions: clarificationQuestions.slice(0, 3),
    evidence,
    confidence,
    profile_confidence: confidence,
    prompt_version: INTENT_PROFILE_VERSION
  }
}

module.exports = {
  INTENT_PROFILE_VERSION,
  MAX_SUPPLEMENT_LENGTH,
  normalizeMode,
  sanitizeSupplement,
  compileIntentProfile
}
