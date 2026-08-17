const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { normalizeResult } = require('../../miniprogram/cloudfunctions/api/agent/langgraphClient')

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8')
}

async function main() {
  assert.strictEqual(normalizeResult({
    status: 'completed',
    threadId: 'wf_thread_aaaaaaaaaaaaaaaa',
    phase: 'completed',
    replyDraft: 'ok',
    pendingAction: null,
    rawDatabase: [{ openid: 'never' }]
  }).rawDatabase, undefined)
  assert.strictEqual(normalizeResult({ status: 'root', threadId: 'wf_thread_aaaaaaaaaaaaaaaa', phase: 'x' }), null)

  for (const file of [
    'miniprogram/cloudfunctions/agent-graph/src/graphs/customerService.ts',
    'miniprogram/cloudfunctions/agent-graph/src/graphs/dateCoordination.ts',
    'miniprogram/cloudfunctions/agent-graph/src/model.ts'
  ]) {
    const source = read(file)
    assert.strictEqual(/wx-server-sdk|require\(['"]\.\.\/lib\/db|from ['"].*database/.test(source), false, `${file} must not import business DB`)
    assert.strictEqual(/conversation_id|conversationId/.test(source), false, `${file} must not use provider conversation IDs`)
  }

  console.log('PASS langgraph route contract')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
