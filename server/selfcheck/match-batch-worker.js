const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { shanghaiBusinessClock, formalBatchKey } = require('../../miniprogram/cloudfunctions/api/lib/businessClock')
const { formalBatchDocumentId } = require('../../miniprogram/cloudfunctions/api/lib/matchCycleService')
const { runFormalMatchBatch, redactBatchError } = require('../../miniprogram/cloudfunctions/api/lib/matchingRunService')
const { assertInternalWorkerSecret } = require('../../miniprogram/cloudfunctions/api/lib/internalWorkerAuth')

const fridayUtc = new Date('2026-08-13T16:00:00.000Z')
const fridayClock = shanghaiBusinessClock(fridayUtc)
assert.strictEqual(fridayClock.businessDate, '2026-08-14')
assert.strictEqual(fridayClock.weekday, 5)
assert.strictEqual(fridayClock.isMatchDay, true)
assert.strictEqual(fridayClock.matchType, '周五')
assert.strictEqual(fridayClock.matchCycleId, '2026-08-14-FRI')
assert.strictEqual(fridayClock.batchKey, 'formal:2026-08-14-FRI')
assert.strictEqual(formalBatchKey(fridayClock.businessDate, 'FRI'), 'formal:2026-08-14-FRI')

const wednesdayUtc = new Date('2026-08-11T16:00:00.000Z')
const wednesdayClock = shanghaiBusinessClock(wednesdayUtc)
assert.strictEqual(wednesdayClock.businessDate, '2026-08-12')
assert.strictEqual(wednesdayClock.weekday, 3)
assert.strictEqual(wednesdayClock.isMatchDay, true)
assert.strictEqual(wednesdayClock.matchType, '周三')

const thursdayUtc = new Date('2026-08-12T16:00:00.000Z')
assert.strictEqual(shanghaiBusinessClock(thursdayUtc).isMatchDay, false)
assert.strictEqual(shanghaiBusinessClock(new Date('2026-08-14T16:00:00.000Z')).businessDate, '2026-08-15')

const redacted = redactBatchError(new Error('timeout openid=omSecret phone=13800000000'))
assert.strictEqual(redacted.error_class, 'transient')
assert(!String(redacted.message || '').includes('omSecret'))
assert(!String(redacted.message || '').includes('13800000000'))
assert.throws(() => assertInternalWorkerSecret('', '01234567890123456789012345678901'), /拒绝/)
assert.throws(() => assertInternalWorkerSecret('wrong-secret', '01234567890123456789012345678901'), /拒绝/)
assert.strictEqual(assertInternalWorkerSecret('01234567890123456789012345678901', '01234567890123456789012345678901'), true)

function memoryDeps(matcher) {
  const tables = { match_batch_run: [] }
  let seq = 1
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    tables,
    acquireBatch: async (data) => {
      const existing = tables.match_batch_run.find((row) => row.batch_key === data.batch_key)
      if (existing) return { acquired: false, batch: existing }
      const row = { _id: formalBatchDocumentId(data.match_cycle_id), id: seq++, ...data }
      tables.match_batch_run.push(row)
      return { acquired: true, batch: row }
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => fridayUtc,
    executeMatching: matcher
  }
}

async function main() {
  const skipped = await runFormalMatchBatch({ now: thursdayUtc, requestId: 'req-skip', triggerSource: 'timer' }, memoryDeps(async () => {
    throw new Error('should not run')
  }))
  assert.strictEqual(skipped.status, 'blocked')
  assert.strictEqual(skipped.reason_code, 'not_match_day')

  const matchedDeps = memoryDeps(async () => ({ matched_count: 2, users_considered: 8, candidates_evaluated: 7 }))
  const matched = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-1', triggerSource: 'timer' }, matchedDeps)
  assert.strictEqual(matched.status, 'completed_matched')
  assert.strictEqual(matched.batch_key, 'formal:2026-08-14-FRI')
  assert.strictEqual(matched.match_cycle_id, '2026-08-14-FRI')
  assert.strictEqual(matched.matched_count, 2)
  const replay = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-2', triggerSource: 'timer' }, matchedDeps)
  assert.strictEqual(replay.id, matched.id)
  assert.strictEqual(matchedDeps.tables.match_batch_run.length, 1)

  const emptyDeps = memoryDeps(async () => ({ matched_count: 0, users_considered: 3, candidates_evaluated: 2 }))
  const empty = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-empty', triggerSource: 'timer' }, emptyDeps)
  assert.strictEqual(empty.status, 'completed_no_match')
  const emptyReplay = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-empty-2', triggerSource: 'timer' }, emptyDeps)
  assert.strictEqual(emptyReplay.id, empty.id)
  assert.strictEqual(emptyDeps.tables.match_batch_run.length, 1)

  let attempts = 0
  const failDeps = memoryDeps(async () => {
    attempts += 1
    throw new Error('upstream timeout')
  })
  const failed = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-fail', triggerSource: 'timer' }, failDeps)
  assert.strictEqual(failed.status, 'failed')
  assert.strictEqual(failed.retry_count, 1)
  assert.strictEqual(attempts, 2)

  let releaseAcquire
  let arrivals = 0
  const acquireGate = new Promise((resolve) => { releaseAcquire = resolve })
  const concurrentDeps = memoryDeps(async () => ({ matched_count: 0 }))
  const acquire = concurrentDeps.acquireBatch
  concurrentDeps.acquireBatch = async (data) => {
    arrivals += 1
    if (arrivals === 2) releaseAcquire()
    await acquireGate
    return acquire(data)
  }
  const concurrent = await Promise.all([
    runFormalMatchBatch({ now: fridayUtc, requestId: 'concurrent-1' }, concurrentDeps),
    runFormalMatchBatch({ now: fridayUtc, requestId: 'concurrent-2' }, concurrentDeps)
  ])
  assert.strictEqual(concurrentDeps.tables.match_batch_run.length, 1)
  assert.strictEqual(concurrent[0].id, concurrent[1].id)
  const failedAgain = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-fail-2', triggerSource: 'timer' }, failDeps)
  assert.strictEqual(failedAgain.id, failed.id)
  assert.strictEqual(attempts, 2)

  const root = path.resolve(__dirname, '../..')
  const worker = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/match-worker/index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/match-worker/config.json'), 'utf8'))
  const collections = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/lib/collections.js'), 'utf8')
  const apiIndex = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/index.js'), 'utf8')
  assert.strictEqual(config.triggers.length, 1)
  config.triggers.forEach((trigger) => {
    assert.strictEqual(trigger.type, 'timer')
    assert.strictEqual(String(trigger.config).trim().split(/\s+/).length, 7)
  })
  assert(!JSON.stringify(config).includes('0 0 * * 3,5'))
  assert.strictEqual(config.triggers[0].config, '0 0 16 ? * TUE,THU *')
  assert(worker.includes('MATCH_WORKER_SECRET'))
  assert(apiIndex.includes('assertInternalWorkerSecret'))
  assert(worker.includes('runFormalMatchBatch') || apiIndex.includes('runFormalMatchBatch'))
  assert(collections.includes("match_batch_run: 'match_batch_runs'"))
  console.log('PASS CloudBase formal match worker uses Shanghai business clock and idempotent batches')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
