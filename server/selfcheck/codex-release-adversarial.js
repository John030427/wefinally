'use strict'

const assert = require('assert')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const { ADMIN_ROLES } = require('../src/config/constants')
const { currentAdminRole, hasRouteAccess } = require('../src/utils/adminRbac')
const roleProjection = require('../src/utils/roleDataProjection')
const expressPrivacy = require('../src/utils/privacyMask')
const cloudPrivacy = require('../../miniprogram/cloudfunctions/api/lib/privacyMask')
const waiting = require('../../miniprogram/utils/aiChatWaiting')
const coordination = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { reviewMemberApplication } = require('../../miniprogram/cloudfunctions/api/handlers/member')
const { assertPartnerApplicationScope } = require('../src/utils/partnerScopePolicy')

const SEED = 0x57ef1a11
let state = SEED >>> 0
function random() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0
  return state / 0x100000000
}
function pick(values) {
  return values[Math.floor(random() * values.length)]
}

function assertNoCanary(payload, canary, label) {
  assert.ok(!JSON.stringify(payload).includes(canary), `${label} leaked ${canary}`)
}

async function proveMissingRoleFailsClosed() {
  const request = { method: 'PUT', path: '/withdrawals/1', auth: { role: 'admin', id: 7 } }
  assert.strictEqual(currentAdminRole(request), '', 'missing admin_role must not become super_admin')
  assert.strictEqual(hasRouteAccess(request), false, 'missing admin_role must not authorize writes')
  const unknown = { method: 'GET', path: '/users', auth: { role: 'admin', id: 7, admin_role: 'future_role' } }
  assert.strictEqual(hasRouteAccess(unknown), false, 'unknown admin role must fail closed')
}

async function provePartnerAssignmentScope() {
  const user = { id: 9, promote_partner_id: 3 }
  const reassigned = { id: 10, user_id: 9, assigned_partner_id: 4 }
  assert.throws(
    () => assertPartnerApplicationScope(user, reassigned, 3),
    /无权审核其他合伙人的会员申请/,
    'original promoter must not audit an application reassigned to another partner'
  )
  assert.strictEqual(assertPartnerApplicationScope(user, reassigned, 4), true)
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return body }
  }
}

async function proveExpressPartnerRouteScope() {
  const dbPath = require.resolve('../src/config/db')
  const routePath = require.resolve('../src/routes/partner')
  const previousDb = require.cache[dbPath]
  const previousRoute = require.cache[routePath]
  const user = { id: 9, promote_partner_id: 3, member_status: 'pending_review' }
  const application = { id: 10, user_id: 9, assigned_partner_id: 4, status: 'pending_review', revision: 1 }
  const connection = {
    async query(sql) {
      if (sql.includes('FROM `user` WHERE id = ?')) return [[Object.assign({}, user)]]
      if (sql.includes('FROM member_application WHERE user_id = ?')) return [[Object.assign({}, application)]]
      throw new Error(`unexpected query: ${sql}`)
    },
    release() {}
  }
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getConnection: async () => connection } }
  delete require.cache[routePath]
  try {
    const router = require(routePath)
    const layer = router.stack.find((item) => item.route && item.route.path === '/users/:id/audit')
    assert.ok(layer, 'partner audit route must exist')
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const formerOwnerResponse = responseRecorder()
    await handler({ params: { id: '9' }, body: { action: 'view' }, auth: { id: 3 } }, formerOwnerResponse, (err) => { throw err })
    assert.strictEqual(formerOwnerResponse.statusCode, 403)
    assert.match(formerOwnerResponse.body.message, /无权审核其他合伙人的会员申请/)

    const assignedResponse = responseRecorder()
    await handler({ params: { id: '9' }, body: { action: 'view' }, auth: { id: 4 } }, assignedResponse, (err) => { throw err })
    assert.strictEqual(assignedResponse.statusCode, 200)
    assert.strictEqual(assignedResponse.body.code, 0)
  } finally {
    if (previousDb) require.cache[dbPath] = previousDb
    else delete require.cache[dbPath]
    if (previousRoute) require.cache[routePath] = previousRoute
    else delete require.cache[routePath]
  }
}

async function proveMemberReviewAtomicity() {
  const application = { _id: 'app_10', id: 10, user_id: 8, assigned_partner_id: 3, status: 'pending_review' }
  const user = { _id: 'user_8', id: 8, member_status: 'pending_review' }
  const audits = []
  let transactionTail = Promise.resolve()
  const deps = {
    byId: async (name) => name === 'member_application' ? application : user,
    updateByDoc: async (name, doc, data) => {
      Object.assign(doc, data)
      return doc
    },
    addWithId: async (name, data) => {
      audits.push(Object.assign({}, data))
      return data
    },
    now: () => new Date('2026-08-24T00:00:00.000Z')
  }
  deps.transaction = (work) => {
    const result = transactionTail.then(() => work(deps))
    transactionTail = result.catch(() => {})
    return result
  }
  const actor = { role: 'admin', id: 1 }
  const results = await Promise.allSettled([
    reviewMemberApplication({ applicationId: 10, action: 'approve', note: '' }, actor, deps),
    reviewMemberApplication({ applicationId: 10, action: 'reject', note: '资料不符' }, actor, deps)
  ])
  assert.strictEqual(results.filter((item) => item.status === 'fulfilled').length, 1, 'only one competing review may commit')
  assert.strictEqual(results.filter((item) => item.status === 'rejected').length, 1, 'stale review must be rejected')
  assert.strictEqual(audits.length, 1, 'only the committed review may create an audit row')
  assert.strictEqual(audits[0].from_status, 'pending_review')
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function loadChatPageDefinition() {
  const chatPath = path.join(root, 'miniprogram/pages/chat/chat.js')
  let definition = null
  const previousPage = global.Page
  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(chatPath)]
  require(chatPath)
  global.Page = previousPage
  return definition
}

async function proveDoubleClickSingleFlight(iterations) {
  const definition = loadChatPageDefinition()
  const previousGetApp = global.getApp
  const previousWx = global.wx
  global.wx = { showToast() {} }
  try {
    for (let i = 0; i < iterations; i += 1) {
      const gate = deferred()
      global.getApp = () => ({ checkNetwork: () => gate.promise })
      let turns = 0
      const page = Object.assign({}, definition, {
        data: Object.assign({}, definition.data, {
          inputText: `hello-${i}`,
          sending: false,
          coordinatorReadOnly: false
        }),
        runAssistantTurn: async () => { turns += 1 }
      })
      const first = page.onSend()
      const second = page.onSend()
      gate.resolve(true)
      await Promise.all([first, second])
      assert.strictEqual(turns, 1, `double click started ${turns} turns at iteration ${i}`)
    }
  } finally {
    global.getApp = previousGetApp
    global.wx = previousWx
  }
}

function fuzzRbacPrivacy(count) {
  for (let i = 0; i < count; i += 1) {
    const canary = `SECRET_DTO_${i}_${Math.floor(random() * 1e9)}`
    const row = {
      id: i + 1,
      user_id: i + 2,
      match_user_id: i + 3,
      order_no: `O-${i}`,
      amount: 188,
      status: 'submitted',
      support_code: `WF-${String(i).padStart(6, '0')}`,
      openid: canary,
      unionid: canary,
      user_openid: canary,
      match_user_openid: canary,
      matched_openid: canary,
      future_private_field: { nested: canary }
    }
    const role = pick([ADMIN_ROLES.CUSTOMER_SERVICE, ADMIN_ROLES.FINANCE, ADMIN_ROLES.AUDITOR])
    const payloads = role === ADMIN_ROLES.CUSTOMER_SERVICE
      ? [
          roleProjection.formatOrderByRole(row, role),
          roleProjection.formatHandoffTicket(row, role),
          roleProjection.formatMatchByRole(row, role),
          roleProjection.formatChatSessionForService(row)
        ]
      : role === ADMIN_ROLES.FINANCE
        ? [roleProjection.formatOrderByRole(row, role), roleProjection.formatWithdrawByRole(row, role)]
        : [roleProjection.formatUserDetailForAuditor(row, { future_private_field: { nested: canary } })]
    payloads.forEach((payload) => assertNoCanary(payload, canary, 'RBAC DTO'))
  }
}

function fuzzPartnerProjection(count) {
  for (let i = 0; i < count; i += 1) {
    const canary = `SECRET_PARTNER_${i}_${Math.floor(random() * 1e9)}`
    const application = {
      id: i + 1,
      user_id: i + 2,
      status: 'pending_review',
      city: '深圳',
      [`future_private_${i}`]: { nested: [canary] },
      profile_snapshot_json: canary,
      raw_ai: canary,
      ab_test_run_id: canary
    }
    const user = { id: i + 2, city: '深圳', phone: '13800138000', openid: canary, [`future_user_${i}`]: canary }
    assertNoCanary(expressPrivacy.projectPartnerApplicationItem(application, user, {}), canary, 'Express partner projection')
    assertNoCanary(cloudPrivacy.projectPartnerApplicationItem(application, user, {}), canary, 'Cloud partner projection')
  }
}

function fuzzCoordination(count) {
  for (let i = 0; i < count; i += 1) {
    const version = 1 + Math.floor(random() * 10)
    const proposalId = 1 + Math.floor(random() * 1000)
    const base = {
      id: i + 1,
      user_a_id: 11,
      user_b_id: 22,
      coordination_version: version,
      status: coordination.STATUS.WAITING_CONFIRMATIONS
    }
    const proposal = { id: proposalId, status: 'active', coordination_version: version }
    const confirmations = []
    if (random() > 0.5) confirmations.push({ user_id: 11, proposal_id: proposalId, coordination_version: version, decision: 'confirm' })
    if (random() > 0.5) confirmations.push({ user_id: 22, proposal_id: proposalId, coordination_version: version - 1, decision: 'confirm' })
    const actor = pick([11, 22])
    const decision = pick(['confirm', 'reject'])
    const result = coordination.applyConfirmation(base, proposal, confirmations, { user_id: actor, decision })
    const valid = new Set(result.confirmations
      .filter((row) => row.decision === 'confirm' && row.proposal_id === proposalId && row.coordination_version === version)
      .map((row) => row.user_id))
    assert.strictEqual(result.coordination.status === coordination.STATUS.ARRANGED, valid.has(11) && valid.has(22))
  }
}

function fuzzMalformedReplies(count) {
  const normalize = (raw) => {
    const patch = raw && (raw.patch_preview || raw.patchPreview)
    return patch && patch.preview && Array.isArray(patch.preview.changed_fields) ? { id: patch.id || 'p' } : null
  }
  const malformed = [null, undefined, '', '   ', 0, false, {}, { reply: '' }, { patch_preview: {} }, { patchPreview: { preview: { changed_fields: 'x' } } }]
  for (let i = 0; i < count; i += 1) {
    const value = pick(malformed)
    const result = waiting.evaluateAssistantReply(value, normalize)
    assert.strictEqual(result.ok, false)
  }
}

function fuzzPartnerScope(count) {
  for (let i = 0; i < count; i += 1) {
    const partnerId = 1 + Math.floor(random() * 30)
    const assigned = 1 + Math.floor(random() * 30)
    const promoter = 1 + Math.floor(random() * 30)
    const user = { id: i + 1, promote_partner_id: promoter }
    const application = { id: i + 1, user_id: user.id, assigned_partner_id: assigned }
    if (assigned === partnerId) {
      assert.strictEqual(assertPartnerApplicationScope(user, application, partnerId), true)
    } else {
      assert.throws(() => assertPartnerApplicationScope(user, application, partnerId), /无权审核/)
    }
  }
}

async function main() {
  await proveMissingRoleFailsClosed()
  await provePartnerAssignmentScope()
  await proveExpressPartnerRouteScope()
  await proveMemberReviewAtomicity()
  fuzzRbacPrivacy(5000)
  fuzzPartnerProjection(2000)
  fuzzCoordination(5000)
  await proveDoubleClickSingleFlight(2000)
  fuzzMalformedReplies(2000)
  fuzzPartnerScope(2000)
  const fuzzCases = 18000
  console.log('PASS codex release adversarial selfcheck')
  console.log(JSON.stringify({ seed: SEED, fuzz_cases: fuzzCases, external_AI_calls: 0, cloudbase_AI_calls: 0 }))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
