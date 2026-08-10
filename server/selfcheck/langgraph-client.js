const assert = require('assert')
const {
  readLangGraphConfig,
  createActorRef,
  createThreadId,
  invokeLangGraph,
  runLangGraphStep
} = require('../../miniprogram/cloudfunctions/api/agent/langgraphClient')

async function main() {
  assert.deepStrictEqual(readLangGraphConfig({}), {
    enabled: false,
    shadowMode: false,
    timeoutMs: 8000,
    actorSecret: ''
  })
  assert.strictEqual(readLangGraphConfig({ LANGGRAPH_ENABLED: 'true', LANGGRAPH_SHADOW_MODE: 'true', LANGGRAPH_TIMEOUT_MS: '99999', LANGGRAPH_ACTOR_SECRET: 'secret' }).timeoutMs, 15000)

  const actorRef = createActorRef(716, 'test-secret')
  assert.match(actorRef, /^usr_[a-f0-9]{32}$/)
  assert.strictEqual(actorRef.includes('716'), false)
  assert.match(createThreadId(22, 'test-secret'), /^wf_thread_[a-f0-9]{32}$/)

  let invoked = 0
  const disabled = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '你好', safeSummary: '' }, {
    env: {},
    invokeFunction: async () => { invoked += 1 }
  })
  assert.deepStrictEqual(disabled, { kind: 'disabled', code: 'graph_disabled' })
  assert.strictEqual(invoked, 0)

  const normalized = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '手机号13800138000', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async (_name, payload) => {
      invoked += 1
      assert.strictEqual(JSON.stringify(payload).includes('13800138000'), false)
      return { result: { success: true, data: { status: 'completed', threadId: payload.threadId, phase: 'completed', replyDraft: 'ok', pendingAction: null, phone: 'never' } } }
    }
  })
  assert.strictEqual(normalized.kind, 'result')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized.result, 'phone'), false)

  let tools = 0
  const shadow = await runLangGraphStep({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '投诉', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_SHADOW_MODE: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async (_name, payload) => ({ result: { success: true, data: { status: 'awaiting_tool', threadId: payload.threadId, phase: 'manual_review', replyDraft: '', pendingAction: { type: 'create_human_ticket', arguments: {}, requiresConfirmation: false } } } }),
    executeTool: async () => { tools += 1 }
  })
  assert.strictEqual(shadow.kind, 'shadow')
  assert.strictEqual(tools, 0)

  const timedOut = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '你好', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_TIMEOUT_MS: '10', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async () => new Promise(() => {})
  })
  assert.strictEqual(timedOut.kind, 'fallback')
  assert.strictEqual(timedOut.code, 'graph_timeout')

  console.log('PASS langgraph client')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
