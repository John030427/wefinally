const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const apiRoot = path.join(root, 'miniprogram/cloudfunctions/api')
const dbPath = path.join(apiRoot, 'lib/db.js')
const deepseekPath = path.join(apiRoot, 'lib/deepseek.js')
const userPath = path.join(apiRoot, 'handlers/user.js')

function installStub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  }
}

installStub(dbPath, {
  db: {
    command: {
      inc: (n) => ({ $inc: n }),
      lte: (value) => ({ $lte: value })
    }
  },
  col: () => ({
    where: () => ({
      update: async () => ({ stats: { updated: 0 } }),
      get: async () => ({ data: [] }),
      remove: async () => ({ stats: { removed: 0 } })
    })
  }),
  first: async () => null,
  byId: async () => null,
  now: () => new Date('2026-09-03T12:00:00.000Z')
})
installStub(deepseekPath, {
  generateStructuredMatchReports: async () => ({
    model: 'mock',
    reports: { a: { summary: 'ok' }, b: { summary: 'ok' } },
    input_snapshot: { users: { a: 10, b: 20 } }
  })
})
installStub(userPath, {
  currentUser: async () => ({ id: 1 })
})

const user = read('miniprogram/cloudfunctions/api/handlers/user.js')
const taskSource = read('miniprogram/cloudfunctions/api/handlers/reportTask.js')
const { STATUS, retentionDates } = require('../../miniprogram/cloudfunctions/api/lib/reportTaskPolicy')
const { processOne, cleanupExpiredTasks } = require('../../miniprogram/cloudfunctions/api/handlers/reportTask')

assert(user.includes("status: 'cancelled'"))
assert(user.includes('reports: null'))
assert(user.includes('input_snapshot: null'))
assert(user.includes('delete_after'))
assert(user.includes("ai_report_text: ''"))
assert(user.includes("local_report_text: ''"))
assert(taskSource.includes('cleanupExpiredTasks'))
assert(taskSource.includes('STATUS.EXPIRED'))
assert(taskSource.includes('.remove()'))

async function main() {
  assert.strictEqual(typeof processOne, 'function', 'processOne must be exportable for retention behavior tests')
  assert.strictEqual(typeof cleanupExpiredTasks, 'function')

  const generatedAt = new Date('2026-09-03T12:00:00.000Z')
  const expected = retentionDates(generatedAt)
  const rows = [{
    _id: 'task-1',
    status: STATUS.QUEUED,
    attempt_count: 0,
    match_log_ids: { a: 1, b: 2 },
    user_ids: { a: 10, b: 20 }
  }]
  const updates = []

  await processOne(rows[0], {
    claimTask: async () => 'attempt-1',
    byId: async (name, id) => {
      if (name === 'user_match_log') {
        return {
          id,
          score_detail_json: '{}',
          counterpart_score_detail_json: '{}'
        }
      }
      if (name === 'user') return { id, nickname: `u${id}` }
      return null
    },
    first: async () => null,
    now: () => generatedAt,
    generateStructuredMatchReports: async () => ({
      model: 'mock',
      reports: { a: { summary: 'ok' }, b: { summary: 'ok' } },
      input_snapshot: { users: { a: 10, b: 20 } }
    }),
    col: () => ({
      where() {
        return {
          async update({ data }) {
            updates.push(Object.assign({}, data))
            Object.assign(rows[0], data)
            return { stats: { updated: 1 } }
          }
        }
      }
    })
  })

  const saved = Object.assign({}, ...updates)
  assert.strictEqual(saved.status, STATUS.SUCCEEDED, 'success update missing')
  assert(saved.report_expires_at instanceof Date, 'generated task missing report_expires_at')
  assert(saved.input_expires_at instanceof Date, 'generated task missing input_expires_at')
  assert(saved.input_expires_at > saved.generated_at)
  assert(saved.report_expires_at > saved.input_expires_at)
  assert.strictEqual(saved.input_expires_at.toISOString(), expected.input_expires_at.toISOString())
  assert.strictEqual(saved.report_expires_at.toISOString(), expected.report_expires_at.toISOString())

  const expiredNow = new Date(expected.report_expires_at.getTime() + 1000)
  rows[0].input_snapshot = { keep: false }
  rows[0].reports_json = JSON.stringify({ a: { summary: 'ok' } })
  rows[0].reports = { a: { summary: 'ok' } }
  rows[0].input_expires_at = expected.input_expires_at
  rows[0].report_expires_at = expected.report_expires_at
  rows[0].status = STATUS.SUCCEEDED

  const cleanup = await cleanupExpiredTasks({
    now: () => expiredNow,
    col: () => ({
      where(query) {
        return {
          async update({ data }) {
            if (query.input_expires_at) {
              Object.assign(rows[0], data)
              return { stats: { updated: 1 } }
            }
            if (query.report_expires_at) {
              Object.assign(rows[0], data)
              return { stats: { updated: 1 } }
            }
            return { stats: { updated: 0 } }
          },
          async remove() {
            return { stats: { removed: 0 } }
          }
        }
      }
    }),
    command: {
      lte: (value) => ({ $lte: value })
    }
  })
  assert.strictEqual(cleanup.inputs_redacted, 1)
  assert.strictEqual(cleanup.reports_expired, 1)
  assert.strictEqual(rows[0].input_snapshot, null)
  assert.strictEqual(rows[0].reports_json, null)
  assert.strictEqual(rows[0].reports, null)
  assert.strictEqual(rows[0].status, STATUS.EXPIRED)

  console.log('PASS ai report retention')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
