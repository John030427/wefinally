const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const route = read('miniprogram/cloudfunctions/api/handlers/route.js')
const backoffice = read('miniprogram/cloudfunctions/api/handlers/backoffice.js')
const collections = read('miniprogram/cloudfunctions/api/lib/collections.js')
const {
  canBootstrapCollection,
  isMissingCollectionError,
  withCollectionBootstrap
} = require('../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy')

for (const contract of [
  "'POST /api/agent/sessions'",
  "'POST /api/agent/human-tickets'",
  "'POST /api/date-coordinations'",
  "'GET /api/match/feedback'",
  "'POST /api/match/feedback'",
  "'GET /api/date-feedback'",
  "'POST /api/date-feedback'",
  "'GET /api/chat/history'",
  "'POST /api/chat/send'",
  '/api\\/agent\\/sessions\\/(\\d+)\\/messages',
  '/api\\/date-coordinations\\/(\\d+)$',
  '/api\\/date-coordinations\\/(\\d+)\\/invitation-response',
  '/api\\/date-coordinations\\/(\\d+)\\/application',
  '/api\\/date-coordinations\\/(\\d+)\\/application-patches',
  '/api\\/date-coordinations\\/(\\d+)\\/application-patches\\/(\\d+)\\/confirm',
  '/api\\/date-coordinations\\/(\\d+)\\/application-patches\\/(\\d+)\\/cancel',
  '/api\\/date-coordinations\\/(\\d+)\\/proposals\\/(\\d+)\\/confirm',
  '/api\\/date-coordinations\\/(\\d+)\\/recoordinate',
  '/api\\/date-coordinations\\/(\\d+)\\/retry-processing'
]) assert(route.includes(contract), `route contract missing: ${contract}`)

for (const contract of [
  '/\\/api\\/admin\\/controlled-date-scenarios$',
  '/\\/api\\/admin\\/controlled-date-scenarios\\/([^/]+)$',
  '/\\/api\\/admin\\/controlled-date-scenarios\\/([^/]+)\\/advance$'
]) assert(backoffice.includes(contract), `controlled scenario route missing: ${contract}`)

for (const name of [
  'agent_sessions',
  'agent_messages',
  'agent_runs',
  'agent_tool_calls',
  'agent_human_tickets',
  'knowledge_articles',
  'user_agent_memories',
  'date_coordinations',
  'date_participants',
  'date_applications',
  'date_proposals',
  'date_confirmations',
  'date_application_patches',
  'date_coordination_events',
  'match_experience_feedback',
  'date_experience_feedback',
  'controlled_date_scenario_runs'
]) assert(collections.includes(name), `collection mapping missing: ${name}`)

assert.strictEqual(canBootstrapCollection('agent_session'), true)
assert.strictEqual(canBootstrapCollection('date_application_patch'), true)
assert.strictEqual(canBootstrapCollection('system_counters'), true)
assert.strictEqual(canBootstrapCollection('match_experience_feedback'), true)
assert.strictEqual(canBootstrapCollection('date_experience_feedback'), true)
assert.strictEqual(canBootstrapCollection('controlled_date_scenario_run'), true)
assert.strictEqual(canBootstrapCollection('user'), false)
assert.strictEqual(isMissingCollectionError(new Error('collection not exists: agent_sessions')), true)
assert.strictEqual(isMissingCollectionError(new Error('permission denied')), false)

async function bootstrapChecks() {
  let attempts = 0
  let creates = 0
  const result = await withCollectionBootstrap({
    logicalName: 'agent_session',
    physicalName: 'agent_sessions',
    operation: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('collection not exists: agent_sessions')
      return 'ready'
    },
    createCollection: async (name) => {
      creates += 1
      assert.strictEqual(name, 'agent_sessions')
    }
  })
  assert.strictEqual(result, 'ready')
  assert.strictEqual(attempts, 2)
  assert.strictEqual(creates, 1)

  let deniedCreates = 0
  await assert.rejects(() => withCollectionBootstrap({
    logicalName: 'user',
    physicalName: 'users',
    operation: async () => { throw new Error('collection not exists: users') },
    createCollection: async () => { deniedCreates += 1 }
  }), /collection not exists/)
  assert.strictEqual(deniedCreates, 0)
}

bootstrapChecks().then(() => {
  console.log('PASS agent route and collection contract')
}).catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
