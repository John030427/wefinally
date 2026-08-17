const assert = require('assert')

const { compileAiMatchProfile } = require('../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')
const { scoreBilateralProfiles, bilateralAggregate } = require('../../miniprogram/cloudfunctions/api/lib/bilateralNeedsMatch')
const { attachBilateralFit, withFinalScores } = require('../../miniprogram/cloudfunctions/api/lib/semanticMatchService')

function intent(needs, offersText) {
  return {
    mode: 'automatic',
    requires_confirmation: false,
    profile_confidence: 0.9,
    must_have: (needs.must || []).map((value) => ({ value, confidence: 0.95, evidence: 'test' })),
    preferences: (needs.pref || []).map((value) => ({ value, confidence: 0.9, evidence: 'test' })),
    deal_breakers: (needs.breaks || []).map((value) => ({ value, confidence: 0.95, evidence: 'test' })),
    values: (needs.values || []).map((value) => ({ value, confidence: 0.9, evidence: 'test' })),
    lifestyle: [],
    uncertainties: [],
    contradictions: [],
    evidence: []
  }
}

function profileWith(intentInput, overrides = {}) {
  return compileAiMatchProfile(Object.assign({
    education: '本科',
    city: '深圳',
    self_view_text: overrides.offers || '',
    target_view_text: '希望对方认真对待长期关系。',
    circle_id: 1,
    identity_tags: [{ circle_id: 1, is_primary: true }]
  }, overrides), { intent: intentInput })
}

// Viewer and a complementary partner with explicit needs/offers
const viewerIntent = intent({
  must: ['真诚稳定'],
  pref: ['共同规划生活', '小家庭优先'],
  breaks: ['长期异地'],
  values: ['尊重边界']
}, '')
const partnerIntent = intent({
  must: ['真诚稳定'],
  pref: ['共同规划生活'],
  breaks: ['敷衍了事'],
  values: ['坦诚沟通']
}, '')
const viewer = profileWith(viewerIntent, { offers: '真诚稳定 共同规划生活 小家庭优先 尊重边界' })
const highPartner = profileWith(partnerIntent, {
  education: '硕士',
  offers: '真诚稳定 共同规划生活 小家庭优先',
  circle_id: 8,
  identity_tags: [{ circle_id: 8, is_primary: true }]
})
const lowPartner = profileWith(partnerIntent, {
  education: '大专',
  city: '北京',
  offers: '随缘冒险 不想安定 不要共同规划',
  circle_id: 1,
  identity_tags: [{ circle_id: 1, is_primary: true }]
})

// 单边高不能冒充高匹配：min-sensitive 聚合保证 95/40 明显低于 88/88
assert.ok(bilateralAggregate(88, 88) > bilateralAggregate(95, 40), 'min-sensitive aggregate must punish asymmetric mutual fit')
const mutualHigh = scoreBilateralProfiles(viewer, highPartner)
const asymmetric = scoreBilateralProfiles(viewer, lowPartner)
assert.ok(mutualHigh.mutual_score == null || mutualHigh.mutual_score > 0)
assert.ok(asymmetric.a_to_b.compared || asymmetric.b_to_a.compared)
// 互适（high）必须高于单边强/单边弱（asymmetric）
assert.ok(mutualHigh.mutual_score > asymmetric.mutual_score, 'mutual-high must beat asymmetric pair')

const settingsByUserId = {
  1: { user_id: 1, ai_match_profile_json: viewer },
  2: { user_id: 2, ai_match_profile_json: highPartner },
  3: { user_id: 3, ai_match_profile_json: lowPartner }
}
function rankedItem(id, structuredMutual) {
  return {
    candidate: { id },
    quality: { pass: true },
    mutualScore: structuredMutual,
    viewSimilarity: 80,
    scoreA: { normalizedTotal: structuredMutual, completeness: 100 },
    scoreB: { normalizedTotal: structuredMutual, completeness: 100 }
  }
}
const rankedHighBoth = attachBilateralFit([rankedItem(2, 85), rankedItem(3, 85)], { id: 1 }, settingsByUserId)
const sorted = withFinalScores(rankedHighBoth)
// 相同结构化分时，双边互适分决定最终排序（canonical_score 真正用于交付顺序）
assert.strictEqual(sorted[0].candidate.id, 2, 'mutual-high candidate must rank first')
assert.ok(sorted[0].canonical_score > sorted[1].canonical_score)
assert.ok(sorted[0].bilateral_fit.mutual_score > sorted[1].bilateral_fit.mutual_score)

// 行业不同但 needs/offers 高度互补 > 行业相同但需求不匹配
const complementPartner = profileWith(partnerIntent, {
  education: '博士',
  offers: '真诚稳定 共同规划生活 小家庭优先 尊重边界',
  circle_id: 9,
  identity_tags: [{ circle_id: 9, is_primary: true }]
})
const sameCircleMismatch = profileWith(partnerIntent, {
  education: '本科',
  offers: '随缘 不想规划 不接受共同生活',
  circle_id: 1,
  identity_tags: [{ circle_id: 1, is_primary: true }]
})
const proMap = {
  1: { user_id: 1, ai_match_profile_json: viewer },
  4: { user_id: 4, ai_match_profile_json: complementPartner },
  5: { user_id: 5, ai_match_profile_json: sameCircleMismatch }
}
const complementaryBilateral = scoreBilateralProfiles(viewer, complementPartner)
const circleBilateral = scoreBilateralProfiles(viewer, sameCircleMismatch)
assert.ok(complementaryBilateral.mutual_score > circleBilateral.mutual_score)
const rankedComplement = attachBilateralFit([rankedItem(4, 80), rankedItem(5, 80)], { id: 1 }, proMap)
const sortedComplement = withFinalScores(rankedComplement)
assert.strictEqual(sortedComplement[0].candidate.id, 4, 'needs/offers complementariness should beat same-circle mismatch')
assert.ok(sortedComplement[0].canonical_score > sortedComplement[1].canonical_score)

// 缺少 AI 画像时 bilateral 缺省，最终分仍可用（provider/profile 缺失 fallback 兼容）
const noProfileSettings = {
  1: { user_id: 1, ai_match_profile_json: viewer },
  6: { user_id: 6 }
}
const withoutBilateral = withFinalScores(attachBilateralFit([rankedItem(6, 88)], { id: 1 }, noProfileSettings))
assert.strictEqual(withoutBilateral[0].bilateral_fit, undefined)
assert.ok(Number(withoutBilateral[0].canonical_score) > 0)

console.log('PASS bilateral fit is the default delivery ranking input (min-sensitive, fallback-safe)')
