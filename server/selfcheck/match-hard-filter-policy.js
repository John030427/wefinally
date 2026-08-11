const assert = require('assert')
const { hardOk } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')

const candidate = {
  birth_year: 1993,
  height_range: '175-180cm',
  marry_status: '未婚',
  baby_plan: '3-5年内',
  city: '深圳',
  smoking_status: '不吸烟',
  status: 1,
  member_status: 'approved'
}
const base = { age_min: 25, age_max: 40 }
assert.strictEqual(hardOk(Object.assign({}, base, { must_marry_status: '未婚' }), candidate), true)
assert.strictEqual(hardOk(Object.assign({}, base, { must_marry_status: '离异' }), candidate), false)
assert.strictEqual(hardOk(Object.assign({}, base, { must_baby_plan: '不要孩子' }), candidate), false)
assert.strictEqual(hardOk(Object.assign({}, base, { must_city: '广州' }), candidate), false)
assert.strictEqual(hardOk(Object.assign({}, base, { must_height_min: 180, must_height_max: 190 }), candidate), false)
assert.strictEqual(hardOk(Object.assign({}, base, { must_smoking_status: '不吸烟' }), candidate), true)
assert.strictEqual(hardOk(Object.assign({}, base, { must_smoking_status: '吸烟' }), candidate), false)
assert.strictEqual(hardOk(base, Object.assign({}, candidate, { member_status: 'pending_review' })), true)
assert.strictEqual(hardOk(base, Object.assign({}, candidate, { match_status: 'matched' })), false)
assert.strictEqual(hardOk(base, Object.assign({}, candidate, { matched_partner_id: 42 })), false)

console.log('PASS explicit must constraints and historical match locks use deterministic hard filters')
