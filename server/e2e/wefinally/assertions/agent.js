'use strict'

const assert = require('assert')

function assertThreadResume(runs) {
  assert.ok(Array.isArray(runs) && runs.length >= 2)
  const threads = new Set(runs.map((r) => r.thread_id || r.threadId).filter(Boolean))
  assert.ok(threads.size >= 1)
  return true
}

function assertPatchPreview(reply) {
  assert.strictEqual(reply.requires_confirmation, true)
  assert.ok(reply.patch_preview)
  return true
}

function assertNoDirectDbMutation(db, table, filterFn, countBefore) {
  const after = (db.tables[table] || []).filter(filterFn).length
  assert.strictEqual(after, countBefore)
  return true
}

module.exports = {
  assertThreadResume,
  assertPatchPreview,
  assertNoDirectDbMutation
}
