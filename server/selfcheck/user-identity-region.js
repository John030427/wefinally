const assert = require('assert')
const {
  normalizeIdentityInput,
  legacyTagsFromUser,
  summarizeIdentities,
  identityOverlapScore,
  MAX_TOTAL_IDENTITIES
} = require('../../miniprogram/cloudfunctions/api/lib/userIdentityTags')
const { resolveRegion, listProvinces, listCities } = require('../../miniprogram/cloudfunctions/api/lib/regionNormalize')

const primaryOnly = normalizeIdentityInput({ circle_id: 3 })
assert.strictEqual(primaryOnly.primary_circle_id, 3)
assert.strictEqual(primaryOnly.circle_id, 3)
assert.deepStrictEqual(primaryOnly.secondary_circle_ids, [])
assert.strictEqual(primaryOnly.attribution_unaffected, true)

const multi = normalizeIdentityInput({
  primary_circle_id: 5,
  secondary_circle_ids: [5, 8, 9, 10, 11]
})
assert.strictEqual(multi.primary_circle_id, 5)
assert.deepStrictEqual(multi.secondary_circle_ids, [8, 9])
assert.ok(multi.tags.length <= MAX_TOTAL_IDENTITIES)
assert.ok(multi.tags.every((tag) => tag.circle_id !== undefined))

assert.throws(() => normalizeIdentityInput({ circle_id: 0, occupation_description: '' }))

const legacy = legacyTagsFromUser({ circle_id: 7, occupation_description: '' })
assert.strictEqual(legacy[0].is_primary, true)
assert.strictEqual(legacy[0].source, 'legacy_backfill')

const summary = summarizeIdentities(multi.tags)
assert.strictEqual(summary.primary_circle_id, 5)
assert.deepStrictEqual(summary.secondary_circle_ids, [8, 9])

const overlap = identityOverlapScore(
  [{ circle_id: 1, is_primary: true }, { circle_id: 2, is_primary: false }],
  [{ circle_id: 2, is_primary: true }, { circle_id: 3, is_primary: false }]
)
assert.strictEqual(overlap.compared, true)
assert.ok(overlap.shared.includes('2'))
assert.ok(overlap.score > 0 && overlap.score < 100)

const region = resolveRegion({ city: '深圳' })
assert.strictEqual(region.normalized, true)
assert.strictEqual(region.city_name, '深圳')
assert.strictEqual(region.province_name, '广东省')
assert.ok(listProvinces().length >= 8)
assert.ok(listCities('440000').some((item) => item.city_name === '深圳'))

const unmapped = resolveRegion({ city: '火星市' })
assert.strictEqual(unmapped.normalized, false)
assert.strictEqual(unmapped.city, '火星')

const nativeRegion = resolveRegion({
  province_code: '130000',
  province_name: '河北省',
  city_code: '130100',
  city_name: '石家庄市'
})
assert.strictEqual(nativeRegion.province_code, '130000')
assert.strictEqual(nativeRegion.province_name, '河北省')
assert.strictEqual(nativeRegion.city_code, '130100')
assert.strictEqual(nativeRegion.city_name, '石家庄')
assert.strictEqual(nativeRegion.source, 'declared_codes')

console.log('PASS user identity + province/city normalize')
