'use strict'

const assert = require('assert')
const { hardOk } = require('../../../../miniprogram/cloudfunctions/api/lib/matchPolicy')

function assertHardGatePass(userA, settingA, userB, settingB) {
  assert.strictEqual(hardOk(settingA, userB), true)
  assert.strictEqual(hardOk(settingB, userA), true)
  return true
}

function assertHardGateFail(userA, settingA, userB, settingB) {
  const aToB = hardOk(settingA, userB)
  const bToA = hardOk(settingB, userA)
  assert.strictEqual(aToB && bToA, false)
  return true
}

function assertNoMatch(result) {
  assert.strictEqual(result.matched, false)
  return true
}

function assertMutualMatch(result) {
  assert.strictEqual(result.matched, true)
  assert.ok(result.top)
  return true
}

function assertOneSidedPenalty(result) {
  assert.ok(result.bilateral)
  assert.ok(result.bilateral.mutual_score != null)
  if (result.matched) {
    assert.ok(Number(result.bilateral.mutual_score) < 0.75 || Number(result.top.mutual_score || 0) < 90)
  }
  return true
}

module.exports = {
  assertHardGatePass,
  assertHardGateFail,
  assertNoMatch,
  assertMutualMatch,
  assertOneSidedPenalty
}
