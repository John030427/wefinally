const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  INTENT_PROFILE_VERSION,
  MAX_SUPPLEMENT_LENGTH,
  sanitizeSupplement,
  compileIntentProfile
} = require('../../miniprogram/cloudfunctions/api/lib/intentProfile')
const { normalizeMatchSettingInput } = require('../../miniprogram/cloudfunctions/api/lib/memberPolicy')

const supplement = '  希望未来在杭州或周边发展，重视稳定沟通；手机号 13800138000，不要写入模型。  '
const sanitized = sanitizeSupplement(supplement)
assert(sanitized.length <= MAX_SUPPLEMENT_LENGTH)
assert(!sanitized.includes('13800138000'))
assert(sanitized.includes('[已脱敏]'))

const profile = compileIntentProfile({
  gender: 1,
  city: '深圳',
  baby_plan: '3-5年内',
  self_view_text: '重视真诚、责任和稳定沟通。',
  target_view_text: '希望彼此尊重边界，共同规划生活。',
  appearance_want: '干净自然',
  other_requirements: supplement,
  mode: 'automatic'
})

assert.strictEqual(profile.prompt_version, INTENT_PROFILE_VERSION)
for (const key of [
  'must_have', 'preferences', 'values', 'lifestyle', 'appearance_preferences',
  'deal_breakers', 'uncertainties', 'contradictions', 'clarification_questions',
  'evidence', 'confidence', 'profile_confidence', 'prompt_version'
]) {
  assert(Object.prototype.hasOwnProperty.call(profile, key), `missing ${key}`)
}
assert.strictEqual(profile.mode, 'automatic')
assert.strictEqual(profile.requires_confirmation, false)
assert(profile.values.every((item) => item.evidence && item.strength && typeof item.confidence === 'number'))
assert(!JSON.stringify(profile).includes('13800138000'))

const confirmProfile = compileIntentProfile({
  self_view_text: '重视真诚和沟通。',
  target_view_text: '希望共同规划生活。',
  other_requirements: '希望未来在成都生活。',
  mode: 'confirm'
})
assert.strictEqual(confirmProfile.mode, 'confirm')
assert.strictEqual(confirmProfile.requires_confirmation, true)

const explicitProfile = compileIntentProfile({
  target_view_text: '必须尊重边界；不接受长期异地；希望一起规划生活。',
  other_requirements: '未来必须在华南发展。',
  mode: 'automatic'
})
assert(explicitProfile.must_have.some((item) => item.value.includes('必须尊重边界')))
assert(explicitProfile.must_have.some((item) => item.value.includes('未来必须在华南发展')))
assert(explicitProfile.deal_breakers.some((item) => item.value.includes('不接受长期异地')))

const normalized = normalizeMatchSettingInput({
  prefer_age: '25-30岁',
  prefer_height: '160-170cm',
  prefer_education: '本科',
  my_values: '我的三观自述',
  expect_values: '期待对方三观',
  other_requirements: '  城市、生活规划和其他补充  ',
  unknown_field: 'must not persist'
})
assert.strictEqual(normalized.other_requirements, '城市、生活规划和其他补充')
assert(!Object.prototype.hasOwnProperty.call(normalized, 'unknown_field'))

const matchPage = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/match-setting/match-setting.js'), 'utf8')
const matchWxml = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/match-setting/match-setting.wxml'), 'utf8')
const handler = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/match.js'), 'utf8')
const semanticService = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/semanticMatchService.js'), 'utf8')
assert(matchPage.includes('other_requirements'))
assert(matchPage.includes('intentConfirmation'))
assert(matchPage.includes('onConfirmIntent'))
assert(matchPage.includes('MATCH_INTENT_CONFIRM'))
assert(matchWxml.includes('其他补充需求'))
assert(matchWxml.includes('我对你的理解'))
assert(matchWxml.includes('需要厘清的矛盾'))
assert(handler.includes('other_requirements: normalized.other_requirements'))
assert(handler.includes('intent_profile_json'))
assert(handler.includes('intent_profile_confirmed_at'))
assert(handler.includes('intent_confirmation_required'))
assert(handler.includes("intentProfile.mode === 'confirm'"))
assert(handler.includes('intentMatchGate'))
assert(semanticService.includes('function intentMatchGate'))
assert(semanticService.includes('请先确认 AI 对你的理解后再开始匹配'))
assert(semanticService.includes('你的匹配补充存在需要先厘清的矛盾'))
assert(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8').includes("POST /api/match/intent/confirm"))
assert(matchPage.includes('onEditIntent'))
assert(matchPage.includes("memberStatus === 'approved'"))
assert(matchWxml.includes('返回修改补充'))
assert(matchWxml.includes('确认理解并保存'))

console.log('PASS other requirements and AI intent profile automatic/confirm policy')
