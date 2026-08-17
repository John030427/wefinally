const assert = require('assert')
const {
  AI_MATCH_PROFILE_VERSION,
  SOURCE_KINDS,
  compileAiMatchProfile,
  shouldInvalidateAiMatchProfile,
  applyAiProfileCorrection,
  extractHardGateCandidates,
  assertInferredCannotHardGate,
  sourceFingerprint
} = require('../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')
const { presentAiMatchProfile } = require('../../miniprogram/cloudfunctions/api/lib/aiMatchProfilePresentation')
const { scoreBilateralProfiles, bilateralAggregate, blendStructuredWithBilateral } = require('../../miniprogram/cloudfunctions/api/lib/bilateralNeedsMatch')
const { presentAiMatchReport } = require('../../miniprogram/cloudfunctions/api/lib/aiMatchReportPresentation')

const source = {
  education: '博士',
  city: '深圳',
  baby_plan: '2-3年内',
  self_view_text: '重视真诚、责任和稳定沟通。',
  target_view_text: '必须彼此尊重边界；不能接受丁克。',
  other_requirements: '希望共同规划生活',
  circle_id: 3,
  identity_tags: [
    { circle_id: 3, is_primary: true },
    { circle_id: 8, is_primary: false }
  ],
  psych_profile_json: {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    family_boundary: '小家庭优先',
    career_family: '动态平衡'
  }
}

const profile = compileAiMatchProfile(source)
assert.strictEqual(profile.schema_version, AI_MATCH_PROFILE_VERSION)
assert.strictEqual(profile.source_of_truth, 'raw_profile')
assert.ok(profile.source_profile_version)
assert.ok(Array.isArray(profile.needs))
assert.ok(Array.isArray(profile.can_offer))
assert.ok(Array.isArray(profile.evidence))
assert.ok(profile.confidence && typeof profile.confidence.overall === 'number')
assertInferredCannotHardGate(profile)

const hard = extractHardGateCandidates(profile)
assert.ok(hard.every((item) => item.kind === SOURCE_KINDS.USER_DECLARED))

const fp1 = sourceFingerprint(source)
const fp2 = sourceFingerprint({ ...source, baby_plan: '丁克' })
assert.notStrictEqual(fp1, fp2)
assert.strictEqual(shouldInvalidateAiMatchProfile(profile, source), false)
assert.strictEqual(shouldInvalidateAiMatchProfile(profile, { ...source, baby_plan: '丁克' }), true)

const highA = compileAiMatchProfile({
  ...source,
  self_view_text: '稳定沟通 小家庭优先 共同规划',
  target_view_text: '必须尊重边界'
})
const highB = compileAiMatchProfile({
  education: '博士',
  city: '深圳',
  baby_plan: '2-3年内',
  self_view_text: '尊重边界 稳定推进 小家庭优先',
  target_view_text: '希望真诚沟通与共同规划',
  circle_id: 8,
  identity_tags: [{ circle_id: 8, is_primary: true }, { circle_id: 3, is_primary: false }]
})
const mutualHigh = scoreBilateralProfiles(highA, highB)
assert.ok(mutualHigh.mutual_score != null)

const lowOffer = compileAiMatchProfile({
  education: '大专',
  city: '北京',
  self_view_text: '喜欢冒险旅行',
  target_view_text: '必须每天高强度陪伴',
  circle_id: 1
})
const asymmetric = scoreBilateralProfiles(highA, lowOffer)
assert.ok(asymmetric.a_to_b.compared || asymmetric.b_to_a.compared)
const agg = bilateralAggregate(95, 40)
assert.ok(agg < 70, `asymmetric aggregate should be sensitive, got ${agg}`)

const blended = blendStructuredWithBilateral(80, { mutual_score: 50 })
assert.ok(blended < 80 && blended > 50)

const presented = presentAiMatchReport({
  summary: '双方在长期关系节奏上接近。对方说：我的微信是13800138000',
  strengths: [{ title: '沟通', detail: '都重视及时沟通' }],
  differences: [{ title: '节奏', detail: '推进速度仍需确认' }],
  communication_suggestions: ['先聊生活节奏'],
  data_limitations: ['尚无实际互动']
})
assert.ok(presented.sections.some((section) => section.key === 'bilateral'))
assert.ok(presented.sections.some((section) => section.key === 'why'))
assert.ok(!JSON.stringify(presented).includes('13800138000'))
assert.ok(!JSON.stringify(presented).includes('对方说'))

// ---- user confirmation + correction loop (versioned evidence) ----
const confirmedProfile = compileAiMatchProfile(source, { confirmed_by_user: true })
assert.strictEqual(confirmedProfile.profile_version, 1)
assert.strictEqual(confirmedProfile.confirmed_by_user, true)
const correctedProfile = applyAiProfileCorrection(confirmedProfile, { text: '我其实没有那么事业优先' })
assert.strictEqual(correctedProfile.profile_version, confirmedProfile.profile_version + 1)
assert.strictEqual(correctedProfile.correction_count, 1)
assert.strictEqual(correctedProfile.corrections[0].kind, SOURCE_KINDS.USER_CORRECTION)
assert.strictEqual(correctedProfile.corrections[0].evidence_key, 'user_correction.1')
assert.strictEqual(correctedProfile.corrections[0].can_become_hard_gate, false)
assert.ok(correctedProfile.evidence.some((item) => item.kind === SOURCE_KINDS.USER_CORRECTION && item.key === 'user_correction.1'))
assert.strictEqual(correctedProfile.confirmed_by_user, true)
assert.strictEqual(correctedProfile.source_profile_version, confirmedProfile.source_profile_version)
assertInferredCannotHardGate(correctedProfile)

const carried = compileAiMatchProfile(source, {
  confirmed_by_user: true,
  corrections: correctedProfile.corrections.map((item) => ({ text: item.value, created_at: item.created_at }))
})
assert.strictEqual(carried.correction_count, 1)
assert.strictEqual(carried.corrections[0].kind, SOURCE_KINDS.USER_CORRECTION)

const presentedProfile = presentAiMatchProfile(correctedProfile)
assert.strictEqual(presentedProfile.disclaimer, 'AI 生成内容，仅供参考')
assert.ok(presentedProfile.sections.some((section) => section.key === 'goal'))
assert.ok(presentedProfile.sections.some((section) => section.key === 'corrections'))
assert.ok(!JSON.stringify(presentedProfile).includes('user_correction.'))
assert.ok(!JSON.stringify(presentedProfile).includes('identity_tags'))
assert.ok(!JSON.stringify(presentedProfile).includes('evidence'))

// version discipline: correction must change the version so old profile is not reused
assert.notStrictEqual(String(confirmedProfile.profile_version), String(correctedProfile.profile_version))

console.log('PASS ai match profile + bilateral needs + report presentation + user correction loop')
