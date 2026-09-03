'use strict'

const { resolveAiMode } = require('./harness/aiProvider')
const { printSummary } = require('./reporter/console')
const { writeArtifacts } = require('./reporter/artifacts')
const { createMemoryDb, newRunId } = require('./harness/memoryDb')
const { assertSafeCleanupTarget } = require('./reset/guard')
const { seedPersonas } = require('./personas/factory')
const { allPersonaLabels } = require('./personas/catalog')

const SCENARIOS = [
  require('./scenarios/match-success'),
  require('./scenarios/age-hard-fail'),
  require('./scenarios/one-sided'),
  require('./scenarios/ai-profile'),
  require('./scenarios/profile-evolution'),
  require('./scenarios/date-coordinate'),
  require('./scenarios/direct-accept'),
  require('./scenarios/decline'),
  require('./scenarios/no-response'),
  require('./scenarios/primary-resolution'),
  require('./scenarios/privacy'),
  require('./scenarios/langgraph-resume'),
  require('./scenarios/experience-feedback'),
  require('./scenarios/live-ai-smoke')
]

function listScenarioIds() {
  return SCENARIOS.map((s) => s.id)
}

async function runScenarios(options = {}) {
  const filter = options.scenario ? String(options.scenario).trim().toLowerCase() : ''
  const selected = filter
    ? SCENARIOS.filter((s) => s.id === filter)
    : SCENARIOS

  if (filter && selected.length === 0) {
    throw new Error(`Unknown scenario: ${filter}. Available: ${listScenarioIds().join(', ')}`)
  }

  const results = []
  for (const scenario of selected) {
    const result = await scenario.run(options)
    results.push(result)
  }

  const payload = {
    runId: options.runId || newRunId(),
    aiMode: resolveAiMode(process.env),
    gitHead: options.gitHead || '',
    timestamp: new Date().toISOString(),
    results
  }
  writeArtifacts(payload)
  printSummary(results)
  return results
}

function resetLab(runId) {
  assertSafeCleanupTarget(runId || newRunId())
  return { ok: true, message: 'in-memory lab reset (stateless runner creates fresh DB each scenario)' }
}

function seedLab(runId) {
  const id = runId || newRunId()
  assertSafeCleanupTarget(id)
  const db = createMemoryDb({ runId: id })
  seedPersonas(db, id, allPersonaLabels(), { idBase: 1000 })
  return { ok: true, runId: id, counts: db.snapshot().counts }
}

module.exports = {
  SCENARIOS,
  listScenarioIds,
  runScenarios,
  resetLab,
  seedLab
}
