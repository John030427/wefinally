const assert = require('assert')
const { scorePair, computeViewSimilarity, MATCH_CONFIG } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')
const { buildFieldExplainItems } = require('../../miniprogram/utils/matchReport')

// Characterization: missing preference must not look like evidence of fit.
const emptyPrefs = scorePair(
  { city: '' },
  {
    like_baby_plan: '',
    age_min: null,
    age_max: null,
    height_min: null,
    height_max: null,
    min_education: '',
    like_circle_ids: '',
    psych_profile_json: null
  },
  {
    baby_plan: '不要孩子',
    birth_year: null,
    height_range: '',
    education: '',
    circle_id: 9,
    city: '异地',
    psych_profile_json: null,
    appearance_tags: '[]',
    appearance_description: ''
  },
  0,
  MATCH_CONFIG
)

function notCompared(dim) {
  return dim == null
    || dim === 0
    || (typeof dim === 'object' && (dim.status === 'not_compared' || dim.compared === false || dim.raw_score == null))
}

assert.ok(notCompared(emptyPrefs.detail.baby) || emptyPrefs.detail.baby === null, 'missing baby preference must not award default positive')
assert.ok(notCompared(emptyPrefs.detail.age) || emptyPrefs.detail.age === null, 'missing age preference must not award default positive')
assert.ok(notCompared(emptyPrefs.detail.height) || emptyPrefs.detail.height === null, 'missing height preference must not award default positive')
assert.ok(notCompared(emptyPrefs.detail.education) || emptyPrefs.detail.education === null, 'missing education preference must not award default positive')
assert.ok(notCompared(emptyPrefs.detail.circle) || emptyPrefs.detail.circle === null, 'empty circle preference must not award full weight')
assert.ok(notCompared(emptyPrefs.detail.city) || emptyPrefs.detail.city === null || emptyPrefs.detail.city === 0, 'missing/mismatched city must not award soft default 1')

assert.notStrictEqual(emptyPrefs.detail.baby, 10)
assert.notStrictEqual(emptyPrefs.detail.age, 5)
assert.notStrictEqual(emptyPrefs.detail.height, 3)
assert.notStrictEqual(emptyPrefs.detail.education, 2)
assert.notStrictEqual(emptyPrefs.detail.circle, MATCH_CONFIG.weights.circle)

// Fit score and completeness must be separable concepts.
assert.ok(
  emptyPrefs.completeness == null
    || (typeof emptyPrefs.completeness === 'number' && emptyPrefs.completeness < 50),
  'sparse prefs must expose low completeness separate from fit'
)

// Synonym values should not depend on character Jaccard alone.
const synonym = computeViewSimilarity(
  '我重视踏实和担当',
  '希望对方稳重有责任心',
  '我为人稳重有责任心',
  '希望对方踏实有担当'
)
assert.ok(synonym >= 60, `synonym values must enter semantic recall path; Jaccard got ${synonym}`)

const identical = computeViewSimilarity('我重视踏实', '稳重', '我重视踏实', '稳重')
assert.ok(identical >= 80, 'identical values remain high')

const opposite = computeViewSimilarity(
  '我坚持丁克不要孩子',
  '对方必须不要孩子',
  '我想尽快结婚生两个孩子',
  '对方必须想要孩子'
)
assert.ok(opposite < 40, `opposing life plans must not look highly similar; got ${opposite}`)

// UI must not paint unset dimensions as full bars.
const fakeDetail = {
  side: Object.assign({}, emptyPrefs.detail, { dimensions: emptyPrefs.dimensions })
}
const items = buildFieldExplainItems(fakeDetail)
const circle = items.find((item) => item.key === 'circle')
assert.ok(circle, 'circle explain item exists')
assert.ok(
  circle.percent === 0 || circle.status === 'not_compared' || circle.insufficient === true,
  `unset circle preference must not render full bar; got percent=${circle.percent}`
)

console.log('PASS match score truthfulness characterization')
