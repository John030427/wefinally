const assert = require('assert')
const { hardOk, rankCandidates } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')
const {
  MATCH_SCENARIO_NAMES,
  buildMatchScenario
} = require('./fixtures/match-scenarios')

assert.deepStrictEqual(MATCH_SCENARIO_NAMES, [
  'high_fit',
  'medium_fit',
  'edge_pass',
  'hard_reject',
  'missing_data'
])

for (const name of MATCH_SCENARIO_NAMES) {
  const scenario = buildMatchScenario(name)
  const { owner, candidate, settingsByUserId, expected } = scenario
  const ranked = rankCandidates(owner, [candidate], settingsByUserId)

  if (expected.hardReject) {
    assert.strictEqual(hardOk(settingsByUserId[String(owner.id)], candidate), false, name)
    assert.strictEqual(ranked.length, 0, name)
    continue
  }

  assert.strictEqual(ranked.length, 1, name)
  const result = ranked[0]
  assert.strictEqual(result.quality.pass, expected.qualityPass, name)
  assert(result.scoreA.normalizedTotal >= expected.normalizedRange[0], name)
  assert(result.scoreA.normalizedTotal <= expected.normalizedRange[1], name)
  assert(result.scoreB.normalizedTotal >= expected.normalizedRange[0], name)
  assert(result.scoreB.normalizedTotal <= expected.normalizedRange[1], name)
  assert(result.viewSimilarity >= expected.viewRange[0], name)
  assert(result.viewSimilarity <= expected.viewRange[1], name)
  assert.deepStrictEqual(result.quality.reasons, expected.qualityReasons, name)

  if (name === 'high_fit') {
    assert(result.scoreA.normalizedTotal < 100)
    assert(result.scoreB.normalizedTotal < 100)
  }
  if (name === 'edge_pass') {
    assert(Math.min(result.scoreA.total, result.scoreB.total) >= 90)
    assert(Math.min(result.scoreA.total, result.scoreB.total) <= 95)
  }
  if (name === 'missing_data') {
    assert.strictEqual(result.scoreA.detail.psych_compared, 0)
    assert.strictEqual(result.scoreB.detail.psych_compared, 0)
    assert.strictEqual(result.scoreA.detail.appearance, 0)
    assert.strictEqual(result.scoreB.detail.appearance, 0)
  }
}

assert.throws(() => buildMatchScenario('unknown'), /未知匹配测试场景/)

console.log('PASS deterministic multi-scenario match fixtures')
