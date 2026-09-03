'use strict'

const assert = require('assert')
const { AI_MATCH_PROFILE_VERSION } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')

function assertProfileComplete(aiProfile) {
  assert.ok(aiProfile, 'AI profile missing')
  assert.strictEqual(aiProfile.schema_version, AI_MATCH_PROFILE_VERSION)
  for (const key of ['needs', 'can_offer', 'dealbreakers', 'flexible_preferences', 'values', 'evidence', 'confidence']) {
    assert.ok(aiProfile[key] != null, `missing ${key}`)
  }
  return true
}

function assertProfileVersionIncrements(before, after) {
  assert.ok(Number(after.version || after.ai_match_profile_version || 0) >= Number(before.version || before.ai_match_profile_version || 0))
  return true
}

function assertUserDeclaredOverrides(profile, path, value) {
  const items = profile.needs || []
  const found = items.find((item) => String(item.value).includes(value))
  assert.ok(found, `USER_DECLARED override not found for ${value}`)
  assert.strictEqual(found.kind, 'USER_DECLARED')
  return true
}

module.exports = {
  assertProfileComplete,
  assertProfileVersionIncrements,
  assertUserDeclaredOverrides
}
