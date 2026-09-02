const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  readiness,
  enrollmentPatch,
  isReadyPartner
} = require('../../miniprogram/cloudfunctions/api/lib/qaRealDeviceMatchPolicy')

const timestamp = new Date('2026-09-01T12:00:00.000Z')
const user = {
  id: 1,
  account_mode: 'production',
  status: 1,
  member_status: 'approved',
  is_vip: 1,
  vip_expire_time: '2026-09-10T00:00:00.000Z',
  gender: 1,
  birth_year: 1992,
  height_range: '170-180cm',
  education: '本科',
  city: '深圳',
  marry_status: '未婚',
  baby_plan: '2-3年内',
  circle_id: 1
}
const setting = {
  user_id: 1,
  age_min: 30,
  age_max: 35,
  height_min: 160,
  height_max: 170,
  min_education: '本科',
  like_marry_status: '未婚',
  like_baby_plan: '2-3年内',
  self_view_text: '真诚沟通共同规划稳定生活',
  target_view_text: '真诚沟通共同规划稳定生活'
}

assert.strictEqual(readiness(user, setting, timestamp).ready, true)
const incomplete = readiness(user, {}, timestamp)
assert.strictEqual(incomplete.code, 'profile_incomplete')
assert(incomplete.missing.includes('期待年龄'))

const patch = enrollmentPatch(user, timestamp)
assert.strictEqual(patch.qa_match_cohort, 'qa-real-device-registration-v1')
assert.match(patch.qa_match_run_id, /^qarun_1_/)
const enrolled = { ...user, ...patch }
assert.strictEqual(enrollmentPatch(enrolled, timestamp), null)
const nextRoundPatch = enrollmentPatch({ ...enrolled, match_status: 'matched' }, timestamp, { forceNewRound: true })
assert.match(nextRoundPatch.qa_match_run_id, /^qarun_1_/)
assert.strictEqual(nextRoundPatch.match_status, 'idle')
assert.strictEqual(nextRoundPatch.matched_partner_id, 0)

const partner = { ...enrolled, id: 2, gender: 2, qa_match_run_id: 'qarun_2_test' }
assert.strictEqual(isReadyPartner(enrolled, partner, { ...setting, user_id: 2 }, timestamp), true)
assert.strictEqual(isReadyPartner(enrolled, { ...partner, match_status: 'matched' }, { ...setting, user_id: 2 }, timestamp), false)
assert.strictEqual(isReadyPartner(enrolled, { ...partner, qa_match_cohort: '' }, { ...setting, user_id: 2 }, timestamp), false)

const root = path.resolve(__dirname, '../..')
const route = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
const handler = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/match.js'), 'utf8')
const panel = fs.readFileSync(path.join(root, 'miniprogram/components/qa-match-panel/qa-match-panel.js'), 'utf8')
const view = fs.readFileSync(path.join(root, 'miniprogram/components/qa-match-panel/qa-match-panel.wxml'), 'utf8')
assert(route.includes("'POST /api/match/qa-real-device/start': match.startQaRealDeviceMatch"))
assert(handler.includes("matchType: '双真机QA匹配'"))
assert(handler.includes('candidateIds: readyPartners.map'))
assert(handler.includes('new_round_required'))
assert(panel.includes('MATCH_QA_REAL_DEVICE_START'))
assert(view.includes('两台真机互配测试'))
assert(view.includes('再来一轮真机互配'))

console.log('PASS QA real-device matching readiness and isolated enrollment policy')
