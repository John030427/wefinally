const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  PROFILE_FIELDS,
  buildProfileReadiness,
  buildJourneyState,
  buildMatchSummary
} = require('../../miniprogram/utils/productExperience')

assert(PROFILE_FIELDS.length >= 10)

const incomplete = buildProfileReadiness({
  gender: 1,
  birth_year: 1995,
  city: '深圳',
  education: '本科'
})
assert(incomplete.percent > 0 && incomplete.percent < 100)
assert(incomplete.missingKeys.includes('baby_plan'))
assert(incomplete.missingLabels.includes('生育计划'))

const completeProfile = {
  gender: 1,
  birth_year: 1995,
  city: '深圳',
  education: '本科',
  marry_status: '未婚',
  baby_plan: '2-3年内',
  height_range: '170-180cm',
  circle_id: 2,
  occupation_description: '互联网产品',
  appearance_description: '干净清爽',
  self_view_text: '重视稳定沟通与长期关系',
  target_view_text: '希望对方真诚、有边界感'
}
assert.strictEqual(buildProfileReadiness(completeProfile).percent, 100)

assert.strictEqual(buildJourneyState({
  readiness: incomplete,
  memberStatus: 'approved',
  isVip: true
}).key, 'complete_profile')
assert.strictEqual(buildJourneyState({
  readiness: buildProfileReadiness(completeProfile),
  memberStatus: 'pending_review',
  isVip: true
}).key, 'member_review')
assert.strictEqual(buildJourneyState({
  readiness: buildProfileReadiness(completeProfile),
  memberStatus: 'approved',
  isVip: false
}).key, 'activate_membership')
assert.strictEqual(buildJourneyState({
  readiness: buildProfileReadiness(completeProfile),
  memberStatus: 'approved',
  isVip: true,
  latestMatch: { id: 88 }
}).key, 'review_match')

const summary = buildMatchSummary({
  score_detail: {
    fields: [
      { label: '价值观', score: 18, max_score: 20 },
      { label: '城市', score: 2, max_score: 10 },
      { label: '生活节奏', score: 7, max_score: 10 }
    ],
    data_limitations: ['收入信息未填写']
  }
})
assert(summary.strengths.some((item) => item.includes('价值观')))
assert(summary.confirmations.some((item) => item.includes('城市')))
assert.strictEqual(summary.hasAiText, false)
assert.strictEqual(summary.limitations, undefined)

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const appConfig = JSON.parse(read('miniprogram/app.json'))
assert.strictEqual(appConfig.pages[0], 'pages/welcome/welcome')
assert(appConfig.pages.includes('pages/date-feedback/date-feedback'))
assert(read('miniprogram/pages/welcome/welcome.js').includes('TRUST_ONBOARDING'))
assert(read('miniprogram/pages/welcome/welcome.js').includes('认真认识'))
assert(read('miniprogram/pages/welcome/welcome.js').includes('你的隐私，只留在该在的地方'))
assert(read('miniprogram/pages/welcome/welcome.js').includes('匹配不是答案，是一次好好认识'))
assert(read('miniprogram/pages/profile/profile.wxml').includes('匹配资料就绪度'))
assert(read('miniprogram/pages/index/index.wxml').includes('journeyState'))
assert(read('miniprogram/pages/match-detail/match-detail.wxml').includes('算法与报告细节'))
assert(read('miniprogram/pages/date-feedback/date-feedback.wxml').includes('只对平台可见'))

console.log('product-experience selfcheck passed')
