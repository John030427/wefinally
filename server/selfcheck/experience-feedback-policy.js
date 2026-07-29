const assert = require('assert')

const {
  normalizeMatchFeedback,
  normalizeDateFeedback,
  matchFeedbackDocId,
  dateFeedbackDocId,
  businessDateKey
} = require('../../miniprogram/cloudfunctions/api/lib/experienceFeedbackPolicy')

assert.deepStrictEqual(normalizeMatchFeedback({
  verdict: 'partly_accurate',
  reasons: ['values', 'location', 'values'],
  note: '  需要再了解  ',
  request_human_review: true
}), {
  verdict: 'partly_accurate',
  reasons: ['values', 'location'],
  note: '需要再了解',
  request_human_review: true
})
assert.throws(() => normalizeMatchFeedback({ verdict: 'excellent' }), /反馈结论/)
assert.throws(() => normalizeMatchFeedback({ verdict: 'accurate', note: 'x'.repeat(201) }), /200/)
assert.throws(() => normalizeMatchFeedback({ verdict: 'accurate', note: '微信号: wxid_example123' }), /联系方式/)
assert.throws(() => normalizeMatchFeedback({ verdict: 'accurate', note: '138 0013 8000' }), /联系方式/)

assert.deepStrictEqual(normalizeDateFeedback({
  met_status: 'met',
  continue_intent: 'unsure',
  authenticity: 'minor_gap',
  safety: 'safe',
  reasons: ['conversation', 'pace'],
  note: '',
  avoid_similar: false,
  request_human_review: false
}), {
  met_status: 'met',
  continue_intent: 'unsure',
  authenticity: 'minor_gap',
  safety: 'safe',
  reasons: ['conversation', 'pace'],
  note: '',
  avoid_similar: false,
  request_human_review: false
})
assert.throws(() => normalizeDateFeedback({
  met_status: 'met',
  continue_intent: 'yes',
  authenticity: 'consistent',
  safety: 'danger'
}), /安全感受/)

assert.strictEqual(matchFeedbackDocId(12, 34), 'match_feedback_12_34')
assert.strictEqual(dateFeedbackDocId(12, 34), 'date_feedback_12_34')
assert.strictEqual(businessDateKey(new Date('2026-07-26T16:30:00.000Z')), '2026-07-27')

console.log('experience-feedback-policy selfcheck passed')
