const assert = require('assert')
const path = require('path')

const identityPath = path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/agent/userIdentity.js')
const dbPath = path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/db.js')

function fakeCloudDatabase(seed = {}) {
  const state = {
    users: Object.assign({}, seed.users),
    system_counters: Object.assign({}, seed.system_counters)
  }

  function document(collectionName, documentId) {
    return {
      async get() {
        const value = state[collectionName] && state[collectionName][documentId]
        return { data: value ? Object.assign({ _id: documentId }, value) : null }
      },
      async set({ data }) {
        state[collectionName][documentId] = Object.assign({}, data)
        return { stats: { created: 1 } }
      },
      async update({ data }) {
        const current = state[collectionName][documentId]
        if (!current) throw new Error(`missing ${collectionName}/${documentId}`)
        state[collectionName][documentId] = Object.assign({}, current, data)
        return { stats: { updated: 1 } }
      }
    }
  }

  return {
    state,
    command: {},
    collection(collectionName) {
      return { doc(documentId) { return document(collectionName, documentId) } }
    },
    async runTransaction(handler) {
      return handler({
        collection(collectionName) {
          return { doc(documentId) { return document(collectionName, documentId) } }
        }
      })
    }
  }
}

async function loadDbWithFake(fakeDb) {
  const cloud = require('../../miniprogram/cloudfunctions/api/node_modules/wx-server-sdk')
  const originalDatabase = cloud.database
  cloud.database = () => fakeDb
  delete require.cache[dbPath]
  try {
    return require(dbPath)
  } finally {
    cloud.database = originalDatabase
  }
}

async function main() {
  const {
    isTestUser,
    projectUserIdentity,
    supportCodeFor,
    userLabel
  } = require(identityPath)

  const official = {
    id: 1783497710464352,
    support_code: 'WF-000001',
    gender: 2,
    city: '深圳',
    openid: 'om8Zg3fUAAzSiTluPGTfgUiUiJPA',
    phone: '13800000000'
  }
  const legacy = {
    id: 118,
    openid: 'dev_wefinally_local_openid',
    gender: 1,
    city: '深圳'
  }

  assert.strictEqual(isTestUser(official), false)
  assert.strictEqual(isTestUser(null), false)
  assert.strictEqual(isTestUser(legacy), true)
  assert.strictEqual(isTestUser({ id: 9, is_test_fixture: 1 }), true)
  assert.strictEqual(isTestUser({ id: 10, ab_test_owner_user_id: 7 }), true)
  assert.strictEqual(supportCodeFor(official), 'WF-000001')
  assert.strictEqual(supportCodeFor(legacy), 'TEST-000118')
  assert.throws(() => supportCodeFor({ id: 7, support_code: 'WF-7' }), /用户编号格式无效/)
  assert.strictEqual(userLabel(official), 'WF-000001 · 女 · 深圳')
  assert.strictEqual(userLabel({ id: 9, support_code: 'WF-000009' }), 'WF-000009 · 资料未完善')
  assert.strictEqual(userLabel(legacy), 'TEST-000118 · 男 · 深圳')

  const serviceView = projectUserIdentity(official, { includeSensitive: false })
  assert.deepStrictEqual(serviceView, {
    support_code: 'WF-000001',
    display_label: 'WF-000001 · 女 · 深圳',
    gender: 2,
    gender_text: '女',
    city: '深圳',
    is_test: false,
    identity_kind: 'real_user',
    identity_badge: '真人用户',
    profile_origin: 'real_user',
    account_mode: 'production',
    test_scope: 'none'
  })
  const adminView = projectUserIdentity(official, { includeSensitive: true })
  assert.strictEqual(adminView.id, official.id)
  assert.strictEqual(adminView.openid, official.openid)
  assert.strictEqual(adminView.phone, official.phone)

  const fakeDb = fakeCloudDatabase({
    users: {
      user_7: { id: 7, openid: 'official-openid' },
      user_8: { id: 8, openid: 'official-openid-2' },
      user_9: { id: 9, openid: 'official-openid-3' },
      users_118: { id: 118, openid: 'dev_wefinally_local_openid' }
    }
  })
  const db = await loadDbWithFake(fakeDb)
  const firstCode = await db.ensureUserSupportCode({ _id: 'user_7', id: 7, openid: 'official-openid' })
  assert.strictEqual(firstCode, 'WF-000001')
  assert.strictEqual(fakeDb.state.users.user_7.support_code, 'WF-000001')
  assert.strictEqual(fakeDb.state.system_counters.user_support_code.seq, 1)

  const repeatedCode = await db.ensureUserSupportCode({ _id: 'user_7', id: 7, openid: 'official-openid' })
  assert.strictEqual(repeatedCode, 'WF-000001')
  assert.strictEqual(fakeDb.state.system_counters.user_support_code.seq, 1)

  const secondCode = await db.ensureUserSupportCode({ _id: 'user_8', id: 8, openid: 'official-openid-2' })
  assert.strictEqual(secondCode, 'WF-000002')
  assert.strictEqual(fakeDb.state.system_counters.user_support_code.seq, 2)

  const testCode = await db.ensureUserSupportCode({ _id: 'users_118', id: 118, openid: 'dev_wefinally_local_openid' })
  assert.strictEqual(testCode, 'TEST-000118')
  assert.strictEqual(fakeDb.state.users.users_118.support_code, undefined)
  assert.strictEqual(fakeDb.state.system_counters.user_support_code.seq, 2)

  fakeDb.state.system_counters.user_support_code.seq = 999999
  await assert.rejects(
    () => db.ensureUserSupportCode({ _id: 'user_9', id: 9, openid: 'official-openid-3' }),
    /用户编号已耗尽/
  )

  console.log('PASS stable admin user identity policy')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
