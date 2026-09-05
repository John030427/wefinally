const assert = require('assert')

// Load the API entry first so wx-server-sdk has been initialized before db.js
// creates its database handle. The transaction itself is replaced with a small
// CloudBase-shaped fake so this regression test does not mutate an environment.
require('../../miniprogram/cloudfunctions/api/index.js')
const dbModule = require('../../miniprogram/cloudfunctions/api/lib/db')

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value
}

function createFakeTransaction() {
  const store = {
    date_coordinations: new Map([
      ['date_coordination_9001', {
        _id: 'date_coordination_9001',
        id: 9001,
        user_a_id: 101,
        user_b_id: 202,
        status: 'collecting_initiator',
        coordination_version: 1,
        accepted_base_invitation_version: 0
      }]
    ]),
    // This stale row is deliberately the first row in the collection. A
    // chained transaction where() implementation can incorrectly return it
    // when only the final condition is retained.
    date_applications: new Map([
      ['date_coordination_application_1', {
        _id: 'date_coordination_application_1',
        id: 1,
        coordination_id: 8000,
        user_id: 999,
        coordination_version: 1,
        preference_version: 3,
        application: { activities: ['旧记录'] }
      }]
    ]),
    system_counters: new Map([
      ['date_coordination_application', { _id: 'date_coordination_application', seq: 7 }]
    ])
  }

  function physicalRows(name) {
    return store[name] || new Map()
  }

  function matches(row, query) {
    return Object.entries(query || {}).every(([key, value]) => row[key] === value)
  }

  function collection(name) {
    const rows = physicalRows(name)
    let activeQuery = {}
    const cursor = {
      where(query) {
        // CloudBase transaction cursors keep the predicate supplied to the
        // current where() call. The production adapter must therefore pass
        // the full query in one call, rather than chain one field at a time.
        activeQuery = query || {}
        return cursor
      },
      limit() {
        return {
          async get() {
            return { data: Array.from(rows.values()).filter((row) => matches(row, activeQuery)).map(clone) }
          }
        }
      },
      doc(id) {
        const key = String(id)
        return {
          async get() {
            const row = rows.get(key)
            if (!row) {
              const error = new Error(`document.get:fail document with _id ${key} does not exist`)
              error.errMsg = error.message
              throw error
            }
            return { data: clone(row) }
          },
          async set(request) {
            rows.set(key, Object.assign({}, clone(request.data), { _id: key }))
            return { stats: { updated: 1 } }
          },
          async update(request) {
            const current = rows.get(key) || { _id: key }
            rows.set(key, Object.assign({}, current, clone(request.data)))
            return { stats: { updated: 1 } }
          }
        }
      }
    }
    return cursor
  }

  return { store, raw: { collection } }
}

async function main() {
  const fake = createFakeTransaction()
  const originalRunTransaction = dbModule.db.runTransaction
  dbModule.db.runTransaction = async (work) => work(fake.raw)
  try {
    const result = await dbModule.commitCoordinationApplication({
      coordination: fake.store.date_coordinations.get('date_coordination_9001'),
      user_id: 101,
      coordination_version: 1,
      application: { activities: ['奶茶'] },
      preference_evidence: {},
      application_source: 'initiator_invitation',
      invitation_proposal: { activity: '奶茶' }
    }, new Date('2026-09-05T00:00:00.000Z'))

    assert.strictEqual(Number(result.application.coordination_id), 9001)
    assert.strictEqual(Number(result.application.user_id), 101)
    assert.strictEqual(Number(result.application.coordination_version), 1)
    assert.strictEqual(Number(result.coordination.invitation_version), 1)

    const currentApplications = Array.from(fake.store.date_applications.values())
      .filter((row) => Number(row.coordination_id) === 9001)
    assert.strictEqual(currentApplications.length, 1)
    assert.strictEqual(Number(currentApplications[0].user_id), 101)
    assert.strictEqual(Number(currentApplications[0].preference_version), 1)
  } finally {
    dbModule.db.runTransaction = originalRunTransaction
  }
}

main()
  .then(() => console.log('PASS coordination application transaction query uses the full predicate'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
