const assert = require('assert')
const { invokeLangGraph } = require('../../miniprogram/cloudfunctions/api/agent/langgraphClient')
const { executeGraphTool } = require('../../miniprogram/cloudfunctions/api/agent/langgraphToolBridge')

const input = {
  threadId: 'wf_thread_aaaaaaaaaaaaaaaa',
  actorRef: 'usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  mode: 'customer_service',
  userText: 'hello',
  safeSummary: ''
}

async function main() {
  const disabled = await invokeLangGraph(input, { env: {}, invokeFunction: async () => assert.fail('must not invoke') })
  assert.deepStrictEqual(disabled, { kind: 'disabled', code: 'graph_disabled' })

  const unavailable = await invokeLangGraph(input, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async () => { throw new Error('socket and internal stack must not leak') }
  })
  assert.deepStrictEqual(unavailable, { kind: 'fallback', code: 'graph_unavailable' })

  const invalidCheckpoint = await invokeLangGraph(input, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async () => ({ result: { success: false, code: 'invalid_checkpoint', stack: 'never expose' } })
  })
  assert.deepStrictEqual(invalidCheckpoint, { kind: 'fallback', code: 'invalid_checkpoint' })

  let serviceCalls = 0
  let claims = 0
  const context = {
    userId: 1,
    sessionId: 2,
    coordinationId: 716,
    coordinationVersion: 3,
    idempotencyKey: 'wf_thread_x:3:create_date_application_preview',
    claimIdempotency: async () => {
      claims += 1
      return claims === 1
    }
  }
  const request = {
    type: 'create_date_application_preview',
    arguments: { coordinationId: 716, coordinationVersion: 3, proposal: {} }
  }
  const services = {
    create_date_application_preview: async () => {
      serviceCalls += 1
      return { ok: true, data: { previewId: 'p1', status: 'pending' } }
    }
  }
  await executeGraphTool(request, context, services)
  await assert.rejects(() => executeGraphTool(request, context, services), (error) => error.message === 'duplicate_resume')
  assert.strictEqual(serviceCalls, 1)

  console.log('PASS langgraph recovery')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
