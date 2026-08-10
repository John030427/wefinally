const assert = require('assert')
const {
  GRAPH_TOOL_ALLOWLIST,
  executeGraphTool
} = require('../../miniprogram/cloudfunctions/api/agent/langgraphToolBridge')

async function main() {
  assert.deepStrictEqual(Object.keys(GRAPH_TOOL_ALLOWLIST).sort(), [
    'confirm_date_application',
    'create_date_application_patch',
    'create_date_application_preview',
    'create_human_ticket',
    'get_coordination_overlap',
    'get_coordination_status',
    'get_match_status',
    'notify_coordination_partner'
  ].sort())

  const context = { userId: 7, sessionId: 22, coordinationId: 716, coordinationVersion: 3 }
  let calls = 0
  const services = {
    create_date_application_preview: async (args, safeContext) => {
      calls += 1
      assert.strictEqual(safeContext.userId, 7)
      return { ok: true, data: { previewId: 'preview_1', status: 'pending', phone: 'never' } }
    }
  }
  const result = await executeGraphTool({
    type: 'create_date_application_preview',
    arguments: { coordinationId: 716, coordinationVersion: 3, proposal: { region: '福田区' } },
    requiresConfirmation: false
  }, context, services)
  assert.deepStrictEqual(result, { ok: true, data: { previewId: 'preview_1', status: 'pending' } })
  assert.strictEqual(calls, 1)

  await assert.rejects(() => executeGraphTool({ type: 'drop_database', arguments: {} }, context, services), /graph_tool_not_allowed/)
  await assert.rejects(() => executeGraphTool({
    type: 'create_date_application_preview',
    arguments: { coordinationId: 716, coordinationVersion: 2, proposal: {} }
  }, context, services), /stale_coordination_version/)
  assert.strictEqual(calls, 1)

  await assert.rejects(() => executeGraphTool({
    type: 'create_date_application_preview',
    arguments: { coordinationId: 999, coordinationVersion: 3, proposal: {} }
  }, context, services), /coordination_scope_mismatch/)
  assert.strictEqual(calls, 1)

  console.log('PASS langgraph tool bridge')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
