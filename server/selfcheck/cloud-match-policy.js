const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  MATCH_CONFIG,
  hardOk,
  harmonicMean,
  rankCandidates,
  scoreDetailFor
} = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')

const psych = JSON.stringify({
  marriage_pace: '稳定推进',
  conflict_style: '及时沟通',
  security_space: '亲密也独立',
  family_boundary: '边界清晰',
  money_view: '共同规划',
  career_family: '动态平衡'
})

function user(id, overrides) {
  return Object.assign({
    id,
    gender: id === 1 ? 1 : 2,
    birth_year: id === 1 ? 1992 : 1995,
    height_range: id === 1 ? '175-180cm' : '160-165cm',
    education: '本科',
    circle_id: 1,
    city: '深圳',
    baby_plan: '3-5年内',
    appearance_description: '干净清爽，生活方式健康',
    appearance_want: '干净清爽'
  }, overrides || {})
}

function setting(userId, overrides) {
  return Object.assign({
    user_id: userId,
    age_min: 25,
    age_max: 40,
    height_min: null,
    height_max: null,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '3-5年内',
    self_view_text: '重视真诚责任稳定沟通共同规划生活家庭边界清晰',
    target_view_text: '重视真诚责任稳定沟通共同规划生活家庭边界清晰',
    psych_profile_json: psych
  }, overrides || {})
}

const initiator = user(1)
const strong = user(2)
const weak = user(3, {
  city: '异地',
  baby_plan: '不要孩子',
  circle_id: 9,
  psych_profile_json: JSON.stringify({
    marriage_pace: '顺其自然',
    conflict_style: '需要空间',
    security_space: '重视个人空间',
    family_boundary: '大家庭融合',
    money_view: '相对独立',
    career_family: '事业优先'
  }),
  appearance_description: '完全不同'
})
const tooYoung = user(4, { birth_year: new Date().getFullYear() - 20 })
const missingAge = user(5, { birth_year: null })

const settings = {
  1: setting(1),
  2: setting(2),
  3: setting(3, {
    self_view_text: '随缘即可不要规划保持距离',
    target_view_text: '随缘即可不要规划保持距离',
    like_baby_plan: '不要孩子'
  }),
  4: setting(4, { age_min: 25, age_max: 40 }),
  5: setting(5)
}

assert.strictEqual(hardOk(settings[1], tooYoung, MATCH_CONFIG), false)
assert.strictEqual(hardOk(settings[1], missingAge, MATCH_CONFIG), false)
assert.strictEqual(hardOk({ age_min: 30 }, user(8, { birth_year: new Date().getFullYear() - 25 }), MATCH_CONFIG), false)
assert.strictEqual(hardOk({ age_max: 30 }, user(9, { birth_year: new Date().getFullYear() - 35 }), MATCH_CONFIG), false)
assert.strictEqual(harmonicMean(100, 25), 40)

const ranked = rankCandidates(initiator, [weak, tooYoung, strong], settings)
assert.strictEqual(ranked.length, 2)
assert.strictEqual(ranked[0].candidate.id, strong.id)
assert.strictEqual(ranked[0].quality.pass, true)
assert.strictEqual(ranked[1].quality.pass, false)
assert(ranked[0].mutualScore > ranked[1].mutualScore)
assert.strictEqual(ranked[0].scoreA.detail.psych_compared, 6)
assert.strictEqual(ranked[0].scoreB.detail.psych_compared, 6)

const blocked = rankCandidates(initiator, [strong], settings, { blockedIds: new Set([strong.id]) })
assert.strictEqual(blocked.length, 0)

const tiedA = user(6)
const tiedB = user(7)
const tiedSettings = {
  1: setting(1),
  6: setting(6),
  7: setting(7)
}
const tied = rankCandidates(initiator, [tiedB, tiedA], tiedSettings)
assert.deepStrictEqual(tied.map((item) => item.candidate.id), [6, 7])

const oneSidedSettings = {
  1: setting(1),
  2: setting(2, {
    like_baby_plan: '不要孩子',
    min_education: '博士',
    like_circle_ids: '9'
  })
}
const oneSided = rankCandidates(initiator, [strong], oneSidedSettings)
assert.strictEqual(oneSided.length, 1)
assert(oneSided[0].scoreA.total > oneSided[0].scoreB.total)
assert.strictEqual(oneSided[0].quality.pass, false)
assert(oneSided[0].quality.reasons.includes('side_score'))

const detail = scoreDetailFor(ranked[0], 'a', 1)
assert.strictEqual(detail.version, 'algo_evidence_v2')
assert.strictEqual(detail.quality_gate.pass, true)
assert.notStrictEqual(detail.total, 88)
assert(detail.side.dimensions.view.compatibility_score > 0)

const handler = fs.readFileSync(path.resolve(
  __dirname,
  '../../miniprogram/cloudfunctions/api/handlers/match.js'
), 'utf8')
const startBody = handler.split('async function start')[1].split('module.exports')[0]
assert(startBody.indexOf("ranked.find((item) => item.quality.pass)") < startBody.indexOf("addWithId('user_match_log'"))
assert(startBody.includes('if (!best)'))
assert(handler.includes('ensureScoreDetailDimensions(parseJson(row.score_detail_json), row, viewer, partner)'))

console.log('PASS cloud match policy uses bilateral evidence, quality gates and deterministic ranking')
