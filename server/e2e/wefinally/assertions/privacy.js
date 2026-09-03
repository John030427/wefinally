'use strict'

const assert = require('assert')

function assertNoRawPrivateText(payload, forbiddenPhrases) {
  const text = JSON.stringify(payload || {})
  for (const phrase of forbiddenPhrases || []) {
    assert.strictEqual(text.includes(phrase), false, `leaked private text: ${phrase}`)
  }
  return true
}

function assertCrossPartyPrivacy(graphPayload, privateNote) {
  assertNoRawPrivateText(graphPayload, [privateNote, 'share_message', 'other_requirements', 'transport_constraints'])
  return true
}

module.exports = {
  assertNoRawPrivateText,
  assertCrossPartyPrivacy
}
