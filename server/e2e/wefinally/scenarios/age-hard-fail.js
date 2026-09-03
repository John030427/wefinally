'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { runMatchPipeline } = require('../harness/matchService')
const { assertHardGateFail, assertNoMatch } = require('../assertions/match')

async function run() {
  const name = 'AGE-HARD-GATE'
  try {
    const { db, services, pair } = await seedPair(null, 'C', 'D', 30)
    const result = await runMatchPipeline(db, pair.a.user, pair.b.user, services.ai, { includeFixtures: true })
    assertHardGateFail(pair.a.user, pair.a.setting, pair.b.user, pair.b.setting)
    assertNoMatch(result)
    return passResult(name, {
      personas: `C=${pair.a.user.birth_year} D=${pair.b.user.birth_year} C_required=${pair.a.setting.age_min}-${pair.a.setting.age_max}`,
      expected: 'NO_MATCH reason=AGE_HARD_GATE',
      actual: `Result=NO_MATCH Reason=${result.reason}`,
      stageLog: result.stageLog
    })
  } catch (error) {
    return failResult(name, error, { personas: 'C/D', expected: 'NO_MATCH' })
  }
}

module.exports = { run, id: 'age-hard-fail' }
