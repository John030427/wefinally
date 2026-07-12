const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const route = read('miniprogram/cloudfunctions/api/handlers/route.js')
const collections = read('miniprogram/cloudfunctions/api/lib/collections.js')

for (const contract of [
  "'POST /api/agent/sessions'",
  "'POST /api/agent/human-tickets'",
  "'POST /api/date-coordinations'",
  "'GET /api/chat/history'",
  "'POST /api/chat/send'",
  '/api\\/agent\\/sessions\\/(\\d+)\\/messages',
  '/api\\/date-coordinations\\/(\\d+)$',
  '/api\\/date-coordinations\\/(\\d+)\\/invitation-response',
  '/api\\/date-coordinations\\/(\\d+)\\/application',
  '/api\\/date-coordinations\\/(\\d+)\\/proposals\\/(\\d+)\\/confirm',
  '/api\\/date-coordinations\\/(\\d+)\\/recoordinate'
]) assert(route.includes(contract), `route contract missing: ${contract}`)

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
  'date_confirmations'
]) assert(collections.includes(name), `collection mapping missing: ${name}`)

console.log('PASS agent route and collection contract')
