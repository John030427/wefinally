const assert = require('assert')
const {
  GRAPH_TOOL_ALLOWLIST,
  executeGraphTool
} = require('../../miniprogram/cloudfunctions/api/agent/langgraphToolBridge')

async function main() {
  assert.deepStrictEqual(Object.keys(GRAPH_TOOL_ALLOWLIST).sort(), [
    'cancel_coordination',
    'cancel_date_application_patch',
    'confirm_date_application',
    'confirm_date_application_patch',
    'create_date_application_patch',
    'create_date_application_preview',
    'create_human_ticket',
    'get_coordination_overlap',
    'get_coordination_status',
    'get_match_status',
    'notify_coordination_partner',
    'record_arrival_and_request_partner_status',
    'publish_coordination_event',
    'reject_date_application',
    'respond_date_invitation'
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

  let arrivalToolCalls = []
  const arrivalResult = await executeGraphTool({
    type: 'record_arrival_and_request_partner_status',
    arguments: {
      coordinationId: 716,
      coordinationVersion: 3,
      contextRef: { type: 'meeting_status', coordination_id: 716, coordination_version: 3 }
    }
  }, context, {
    record_arrival_and_request_partner_status: async (args, safeContext) => {
      arrivalToolCalls.push({ args, safeContext })
      return {
        ok: true,
        data: {
          arrivalEventId: 801,
          requestEventId: 802,
          eventType: 'ARRIVAL_STATUS_REQUESTED',
          coordinationVersion: safeContext.coordinationVersion,
          status: 'projected',
          private_location: 'never'
        }
      }
    }
  })
  assert.deepStrictEqual(arrivalResult, {
    ok: true,
    data: {
      arrivalEventId: 801,
      requestEventId: 802,
      eventType: 'ARRIVAL_STATUS_REQUESTED',
      coordinationVersion: 3,
      status: 'projected'
    }
  })
  assert.equal(arrivalToolCalls.length, 1)

  await assert.rejects(() => executeGraphTool({ type: 'drop_database', arguments: {} }, context, services), /tool_not_allowed/)
  await assert.rejects(() => executeGraphTool({
    type: 'create_date_application_preview',
    arguments: { coordinationId: 716, coordinationVersion: 2, proposal: {} }
  }, context, services), /stale_coordination_version/)
  assert.strictEqual(calls, 1)

  await assert.rejects(() => executeGraphTool({
    type: 'create_date_application_preview',
    arguments: { coordinationId: 999, coordinationVersion: 3, proposal: {} }
  }, context, services), /ownership_mismatch/)
  assert.strictEqual(calls, 1)

  console.log('PASS langgraph tool bridge')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
