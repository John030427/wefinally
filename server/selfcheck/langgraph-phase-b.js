const assert = require('assert')
const fs = require('fs')
const path = require('path')
const shared = require('../../miniprogram/cloudfunctions/agent-graph/shared/coordinationAdapters.cjs')

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8')
}

async function main() {
  const handlerSource = read('miniprogram/cloudfunctions/api/handlers/agent.js')
  const graphStateSource = read('miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState.js')
  const graphSource = read('miniprogram/cloudfunctions/agent-graph/src/graphs/dateCoordination.ts')

  assert.match(handlerSource, /executeGraphTool\(action/)
  assert.match(handlerSource, /refreshInput: refreshGraphInput/)
  assert.match(handlerSource, /dateGraphResult\.status !== 'fallback'/)
  assert.doesNotMatch(handlerSource, /modificationIntent|questionLike/)
  assert.match(graphStateSource, /agent-graph\/shared\/coordinationAdapters\.cjs/)
  assert.match(graphSource, /loadCanonicalState/)
  assert.match(graphSource, /parseCommand/)
  assert.match(graphSource, /validateContextVersion/)
  assert.match(graphSource, /candidatePlan/)
  assert.match(graphSource, /PROPOSE_CHANGE_AND_ASK_PARTNER/)

  assert.match(read('miniprogram/cloudfunctions/agent-graph/src/contracts.ts'), /'PARTNER_QUESTION'/)
  assert.strictEqual(shared.toCanonicalCoordinationEventType('application_sent'), 'APPLICATION_SUBMITTED')
  assert.strictEqual(shared.toRuntimeCoordinationField('venue'), 'activity_venue')
  assert.strictEqual(shared.toRuntimeCoordinationField('payment'), 'payment_preference')
  console.log('PASS langgraph Phase B route and shared-adapter contract')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
