'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const graphState = require(path.join(root, 'miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState.js'))

const contextRef = {
  type: 'patch_preview',
  coordination_id: 716,
  coordination_version: 3,
  patch_id: 456
}
const coordination = {
  id: 716,
  user_a_id: 1,
  user_b_id: 2,
  coordination_version: 3,
  status: 'waiting_confirmations',
  business_state: 'coordinating'
}
const application = {
  availability: [{ date: '2026-09-06', periods: ['evening'] }],
  areas: ['福田区'],
  activities: ['吃饭'],
  budget: '100-200',
  payment_preference: 'aa',
  duration: 'flexible'
}
const graphInput = graphState.buildDateCoordinationGraphInput(
  coordination,
  [
    { user_id: 1, coordination_version: 3, application },
    { user_id: 2, coordination_version: 3, application }
  ],
  { id: 1 },
  { confirmations: [], pendingPatch: null, contextRef }
)
assert.deepStrictEqual(graphInput.contextRef, contextRef)
assert.match(read('miniprogram/cloudfunctions/api/handlers/agent.js'), /context_ref|contextRef/)
assert.match(read('miniprogram/cloudfunctions/api/agent/langgraphClient.js'), /contextRef/)
assert.match(read('miniprogram/pages/chat/chat.js'), /activeContextRef/)
assert.match(read('miniprogram/pages/chat/chat.js'), /context_ref/)
assert.match(read('miniprogram/cloudfunctions/agent-graph/src/graphs/dateCoordination.ts'), /state\.contextRef/)
console.log('PASS context_ref survives chat -> API -> graph input boundary')
