'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { runMatchPipeline, buildMatchReport } = require('../harness/matchService')
const { assertMutualMatch, assertHardGatePass } = require('../assertions/match')
const { assertReportGenerated, assertAiDisclosure } = require('../assertions/report')

async function run() {
  const name = 'MATCH-SUCCESS'
  try {
    const { db, services, pair } = await seedPair(null, 'A', 'B', 10)
    const result = await runMatchPipeline(db, pair.a.user, pair.b.user, services.ai, { includeFixtures: true })
    assertHardGatePass(pair.a.user, pair.a.setting, pair.b.user, pair.b.setting)
    assertMutualMatch(result)
    const report = buildMatchReport()
    assertReportGenerated(report)
    assertAiDisclosure(report)
    return passResult(name, {
      personas: `A=${pair.a.user.id} B=${pair.b.user.id}`,
      expected: 'hard PASS, bilateral PASS, report generated',
      actual: `Result=${result.reason} mutual=${result.bilateral && result.bilateral.mutual_score}`,
      stageLog: result.stageLog
    })
  } catch (error) {
    return failResult(name, error, { personas: 'A/B', expected: 'MATCH' })
  }
}

module.exports = { run, id: 'match-success' }
