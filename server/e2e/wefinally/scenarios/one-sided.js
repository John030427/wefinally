'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { runMatchPipeline } = require('../harness/matchService')
const { assertOneSidedPenalty } = require('../assertions/match')

async function run() {
  const name = 'ONE-SIDED'
  try {
    const { db, services, pair } = await seedPair(null, 'E', 'F', 50)
    const result = await runMatchPipeline(db, pair.a.user, pair.b.user, services.ai, { includeFixtures: true })
    assertOneSidedPenalty(result)
    return passResult(name, {
      personas: `E=${pair.a.user.id} F=${pair.b.user.id}`,
      expected: 'one-sided penalty; AI cannot rescue hard fail',
      actual: `matched=${result.matched} mutual=${result.bilateral && result.bilateral.mutual_score}`,
      stageLog: result.stageLog
    })
  } catch (error) {
    return failResult(name, error, { personas: 'E/F' })
  }
}

module.exports = { run, id: 'one-sided' }
