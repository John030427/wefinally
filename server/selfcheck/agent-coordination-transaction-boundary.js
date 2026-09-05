const assert = require('assert')
const fs = require('fs')
const path = require('path')

const agentSource = fs.readFileSync(
  path.join(__dirname, '../../miniprogram/cloudfunctions/api/handlers/agent.js'),
  'utf8'
)

assert(
  agentSource.includes("coordinationHandlerDeps.commitApplication = dep('commitApplication')"),
  'date coordinator agent wiring must pass the core application transaction'
)
assert(
  agentSource.includes("commitApplication: db.commitCoordinationApplication"),
  'agent default deps must expose the core application transaction'
)

console.log('PASS agent coordination tool uses the core application transaction boundary')
