const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')

const SECRET = 'cloud-rbac-selfcheck-secret-2026-08-24'
process.env.BACKOFFICE_TOKEN_SECRET = SECRET

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      database() {
        return {
          command: {},
          collection() { throw new Error('unexpected real CloudBase collection access') },
          createCollection() { throw new Error('unexpected collection creation') }
        }
      },
      openapi: { wxacode: { getUnlimited: async () => Buffer.from('') } }
    }
  }
  if (request === 'bcryptjs') {
    return {
      compareSync: () => true,
      hashSync: () => 'synthetic-password-hash'
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const db = require('../../miniprogram/cloudfunctions/api/lib/db')
const { signBackofficeToken } = require('../../miniprogram/cloudfunctions/api/lib/backofficeToken')
const { handleBackofficeHttp } = require('../../miniprogram/cloudfunctions/api/handlers/backoffice')
Module._load = originalLoad

const tables = {
  admin: [
    { id: 1, username: 'missing-role', status: 1 },
    { id: 2, username: 'unknown-role', role: 'root', status: 1 },
    { id: 3, username: 'finance', role: 'finance', status: 1 },
    { id: 4, username: 'service', role: 'customer_service', status: 1 },
    { id: 5, username: 'auditor', role: 'auditor', status: 1 },
    { id: 6, username: 'super', role: 'super_admin', status: 1 }
  ],
  member_application: [{
    id: 11,
    user_id: 101,
    assigned_partner_id: 201,
    status: 'pending_review',
    profile_snapshot_json: '{"private":true}',
    raw_privacy_logs: [{ event: 'private' }],
    test_metadata: { fixture: true }
  }],
  user: [{
    id: 101,
    support_code: 'WF-000101',
    status: 1,
    member_status: 'pending_review',
    openid: 'cloud-openid-private',
    unionid: 'cloud-unionid-private',
    phone: '13800138000',
    raw_ai_response: 'private model output',
    private_coordination: { original_preferences: true },
    match_settings: { private: true },
    profile_snapshot_json: '{"private":true}',
    is_test: true,
    ab_test_run_id: 'private-test-run'
  }],
  partner: [{ id: 201, name: '合伙人', phone: '13900139000', status: 1 }],
  user_order: [{ id: 301, user_id: 101, order_no: 'PRIVATE-ORDER', price: 188, pay_status: 1 }],
  user_match_setting: [],
  user_match_log: [],
  partner_referral_attribution: [],
  agent_session: [],
  agent_human_ticket: [],
  date_coordination: [],
  agent_notification_job: [],
  partner_user_audit_log: [],
  partner_candidate: [],
  partner_audit_log: []
}

function matches(row, query = {}) {
  return Object.keys(query).every((key) => row[key] === query[key])
}

db.now = () => new Date('2026-08-24T00:00:00.000Z')
db.first = async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null
db.list = async (name, query, limit) => (tables[name] || []).filter((row) => matches(row, query)).slice(0, limit || 500)
db.byId = async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null
db.updateByDoc = async (name, row, update) => Object.assign(row, update)
db.addWithId = async (name, data) => {
  if (!tables[name]) tables[name] = []
  const row = { id: tables[name].length + 1000, ...data }
  tables[name].push(row)
  return row
}
db.transaction = async (execute) => execute(db)

function eventFor(adminId, method, path, body) {
  return {
    httpMethod: method,
    path,
    headers: { authorization: `Bearer ${signBackofficeToken({ role: 'admin', id: adminId }, SECRET)}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  }
}

async function invoke(adminId, method, path, body) {
  if (/member-applications\/11\/review$/.test(path)) {
    tables.member_application[0].status = 'pending_review'
    tables.user[0].member_status = 'pending_review'
  }
  const result = await handleBackofficeHttp(eventFor(adminId, method, path, body))
  return { statusCode: result.statusCode, body: JSON.parse(result.body) }
}

async function invokeLogin(username) {
  const result = await handleBackofficeHttp({
    httpMethod: 'POST',
    path: '/api/auth/admin-login',
    headers: {},
    body: JSON.stringify({ username, password: 'synthetic-password' })
  })
  return { statusCode: result.statusCode, body: JSON.parse(result.body) }
}

function containsForbiddenKey(value) {
  const forbidden = /^(openid|open_id|unionid|union_id|phone|mobile|raw_ai_response|private_coordination|match_settings|profile_snapshot_json|raw_privacy_logs|test_metadata|is_test|ab_test_run_id)$/i
  if (Array.isArray(value)) return value.some(containsForbiddenKey)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => forbidden.test(key) || containsForbiddenKey(nested))
}

async function expectDenied(label, adminId, method, path, body) {
  const result = await invoke(adminId, method, path, body)
  assert.strictEqual(result.statusCode, 403, `${label}: ${JSON.stringify(result.body)}`)
  console.log(`PASS ${label}`)
}

async function expectAllowed(label, adminId, method, path, body) {
  const result = await invoke(adminId, method, path, body)
  assert.strictEqual(result.statusCode, 200, `${label}: ${JSON.stringify(result.body)}`)
  console.log(`PASS ${label}`)
  return result.body.data
}

async function main() {
  assert.strictEqual((await invokeLogin('missing-role')).statusCode, 403)
  console.log('PASS CLOUD_MISSING_ADMIN_ROLE_LOGIN_DENIED')
  assert.strictEqual((await invokeLogin('unknown-role')).statusCode, 403)
  console.log('PASS CLOUD_UNKNOWN_ADMIN_ROLE_LOGIN_DENIED')

  await expectDenied('CLOUD_MISSING_ADMIN_ROLE_DENIED', 1, 'GET', '/api/admin/member-applications')
  await expectDenied('CLOUD_UNKNOWN_ADMIN_ROLE_DENIED', 2, 'GET', '/api/admin/member-applications')
  await expectDenied('CLOUD_FINANCE_MEMBER_REVIEW_DENIED', 3, 'PUT', '/api/admin/member-applications/11/review', { action: 'approve' })
  await expectDenied('CLOUD_FINANCE_PARTNER_CREATE_DENIED', 3, 'POST', '/api/admin/partners', { name: 'F', phone: '13600136000', password: 'password1' })
  await expectDenied('CLOUD_CUSTOMER_SERVICE_MEMBER_REVIEW_DENIED', 4, 'PUT', '/api/admin/member-applications/11/review', { action: 'approve' })
  await expectDenied('CLOUD_CUSTOMER_SERVICE_PARTNER_MUTATION_DENIED', 4, 'POST', '/api/admin/partners', { name: 'C', phone: '13700137000', password: 'password1' })
  await expectDenied('CLOUD_AUDITOR_FINANCE_DENIED', 5, 'GET', '/api/admin/orders')
  await expectDenied('CLOUD_AUDITOR_PARTNER_MUTATION_DENIED', 5, 'POST', '/api/admin/partners', { name: 'A', phone: '13500135000', password: 'password1' })

  await expectAllowed('CLOUD_SUPER_ADMIN_EXPECTED_ACCESS', 6, 'POST', '/api/admin/partners', { name: 'S', phone: '13400134000', password: 'password1' })
  await expectAllowed('CLOUD_AUDITOR_MEMBER_REVIEW_ALLOWED', 5, 'PUT', '/api/admin/member-applications/11/review', { action: 'approve' })
  await expectAllowed('CLOUD_FINANCE_ORDER_ALLOWED', 3, 'GET', '/api/admin/orders')
  await expectAllowed('CLOUD_CUSTOMER_SERVICE_ORDER_ALLOWED', 4, 'GET', '/api/admin/orders')
  await expectAllowed('CLOUD_CUSTOMER_SERVICE_SERVICE_ALLOWED', 4, 'GET', '/api/admin/agent/tickets')

  const auditorRead = await expectAllowed('CLOUD_AUDITOR_SAFE_USER_READ_ALLOWED', 5, 'GET', '/api/admin/member-applications/11')
  assert.strictEqual(containsForbiddenKey(auditorRead), false, `CLOUD_RESPONSE_DATA_RBAC: ${JSON.stringify(auditorRead)}`)
  assert.strictEqual(JSON.stringify(auditorRead).includes('13800138000'), false)
  assert.strictEqual(JSON.stringify(auditorRead).includes('13900139000'), false)
  const auditorPartners = await expectAllowed('CLOUD_AUDITOR_SAFE_PARTNER_READ_ALLOWED', 5, 'GET', '/api/admin/partners')
  assert.strictEqual(JSON.stringify(auditorPartners).includes('13900139000'), false)
  console.log('PASS CLOUD_RESPONSE_DATA_RBAC')

  const expressAuthSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/auth.js'), 'utf8')
  const expressAdminSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/admin.js'), 'utf8')
  const migrationSource = fs.readFileSync(path.resolve(__dirname, '../../database/patch-012-admin-service-role.sql'), 'utf8')
  assert.strictEqual(expressAuthSource.includes('admin.role || ADMIN_ROLES.SUPER_ADMIN'), false)
  assert.strictEqual(expressAdminSource.includes(': ADMIN_ROLES.SUPER_ADMIN'), false)
  assert.match(migrationSource, /SET `role` = 'super_admin'/)
  assert.match(migrationSource, /WHERE `role` IS NULL OR `role` = ''/)
  console.log('PASS EXPRESS_ADMIN_ROLE_RUNTIME_NO_FALLBACK')
  console.log('PASS SQL_LEGACY_ROLE_MIGRATION_EXPLICIT')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
