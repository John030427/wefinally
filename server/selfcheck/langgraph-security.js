const assert = require('assert')
const { invokeLangGraph } = require('../../miniprogram/cloudfunctions/api/agent/langgraphClient')
const { executeGraphTool, safeToolResult } = require('../../miniprogram/cloudfunctions/api/agent/langgraphToolBridge')

async function main() {
  let calls = 0
  const unsafeContext = await invokeLangGraph({
    threadId: 'attacker-thread',
    actorRef: 'openid:oAbCdEfGhIjKlMnOpQrStUv',
    mode: 'customer_service',
    userText: 'hello',
    safeSummary: ''
  }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async () => { calls += 1 }
  })
  assert.deepStrictEqual(unsafeContext, { kind: 'fallback', code: 'unsafe_context' })
  assert.strictEqual(calls, 0)

  await assert.rejects(
    () => executeGraphTool({ type: 'drop_database', arguments: {} }, { userId: 1, sessionId: 2 }, {}),
    (error) => error.message === 'tool_not_allowed'
  )
  await assert.rejects(
    () => executeGraphTool({
      type: 'get_coordination_status',
      arguments: { coordinationId: 999, coordinationVersion: 3 }
    }, { userId: 1, sessionId: 2, coordinationId: 716, coordinationVersion: 3 }, {}),
    (error) => error.message === 'ownership_mismatch'
  )

  const safe = safeToolResult('get_coordination_overlap', {
    ok: true,
    data: {
      hasOverlap: true,
      proposal: {
        region: '福田区',
        phone: '13800138000',
        openid: 'oAbCdEfGhIjKlMnOpQrStUv',
        apiKey: 'sk-secret-key-123456789'
      }
    }
  })
  const serialized = JSON.stringify(safe)
  assert.strictEqual(serialized.includes('13800138000'), false)
  assert.strictEqual(serialized.includes('oAbCdEfGhIjKlMnOpQrStUv'), false)
  assert.strictEqual(serialized.includes('sk-secret'), false)

  console.log('PASS langgraph security')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
