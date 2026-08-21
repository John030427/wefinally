'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const {
  maskPhone,
  sanitizePartnerUser,
  sanitizePartnerSelf,
  sanitizePartnerApplication,
  projectPartnerApplicationItem,
  assertNoSensitivePartnerPayload
} = require('../src/utils/privacyMask')
const cloudPrivacy = require('../../miniprogram/cloudfunctions/api/lib/privacyMask')
const { memberStatusCopy, coordinationStatusCopy, matchLifecycleCopy, humanError } = require('../src/utils/statusCopy')
const { formatPartnerUser } = require('../src/utils/apiFormat')
const { hasRouteAccess, AUDITOR_RULES, FINANCE_RULES, canSeeOpenId } = require('../src/utils/adminRbac')
const { buildAiOps } = require('../src/utils/aiOpsHealth')
const { buildCoordinationOperatorView } = require('../src/utils/coordinationOperatorView')
const { ADMIN_ROLES } = require('../src/config/constants')

const results = {
  STATIC_AND_UNIT: 'PASS',
  SECURITY_NEGATIVE: 'PASS',
  E2E: 'PENDING',
  LIVE_MYSQL: 'BLOCKED_ENVIRONMENT'
}

function fakeReq(role, method, pathName) {
  return { method, path: pathName, auth: { admin_role: role } }
}

// PARTNER_PHONE_MASKED
assert.strictEqual(maskPhone('13812348000'), '138****8000')
assert.strictEqual(maskPhone('138****8000'), '138****8000')
const partnerSelf = sanitizePartnerSelf({ id: 1, name: '张三', phone: '13900001111', password: 'x', promote_code: 'ABC', balance: 10 })
assert.strictEqual(partnerSelf.phone_masked, '139****1111')
assert.strictEqual(partnerSelf.password, undefined)
assert.ok(!('phone' in partnerSelf) || partnerSelf.phone === undefined)

// PARTNER_NO_OPENID
const user = sanitizePartnerUser({
  id: 9,
  openid: 'oxSECRET',
  phone: '13700001234',
  city: '深圳',
  gender: 1,
  member_status: 'pending_review'
})
assert.strictEqual(user.openid, undefined)
assert.strictEqual(user.phone, undefined)
assert.strictEqual(user.phone_masked, '137****1234')
const formatted = formatPartnerUser({ id: 2, openid: 'oxX', phone: '13611112222', city: '广州', gender: 2, member_status: 'approved' })
assert.strictEqual(formatted.openid, undefined)
assert.ok(!JSON.stringify(formatted).includes('oxX'))

const maliciousApplication = {
  id: 1,
  user_id: 2,
  status: 'pending_review',
  revision: 1,
  city: '深圳',
  education: '本科',
  profile_snapshot_json: {
    privatePreference: 'SECRET_PRIVATE_PREF'
  },
  raw_ai: 'SECRET_AI',
  openid: 'SECRET_OPENID',
  reviewed_by_id: 999,
  reviewed_by_role: 'super_admin',
  ab_test_run_id: 'SECRET_TEST',
  ab_test_fixture: { run_id: 'SECRET_TEST' }
}
const maliciousUser = {
  id: 2,
  openid: 'SECRET_OPENID',
  phone: '13800001111',
  city: '深圳',
  gender: 1,
  member_status: 'pending_review'
}

// PARTNER_APPLICATION_LIST_ALLOWLIST_ONLY / NO_PROFILE_SNAPSHOT / NO_AB_TEST / attack full JSON
const projected = projectPartnerApplicationItem(maliciousApplication, maliciousUser, { partner_name: '合伙人甲' })
const projectedJson = JSON.stringify(projected)
assert.ok(!projectedJson.includes('SECRET_PRIVATE_PREF'), 'PARTNER_APPLICATION_LIST_NO_PROFILE_SNAPSHOT')
assert.ok(!projectedJson.includes('SECRET_AI'))
assert.ok(!projectedJson.includes('SECRET_OPENID'))
assert.ok(!projectedJson.includes('SECRET_TEST'))
assert.ok(!projectedJson.includes('profile_snapshot_json'))
assert.ok(!projectedJson.includes('raw_ai'))
assert.ok(!projectedJson.includes('"openid"'))
assert.ok(!projectedJson.includes('ab_test_fixture'))
assert.ok(!projectedJson.includes('reviewed_by_id'))
assert.strictEqual(projected.profile_summary.city, '深圳')
assert.ok(projected.user.phone_masked)
assertNoSensitivePartnerPayload(projected, 'PARTNER_APPLICATION_LIST_ALLOWLIST_ONLY')

const cloudProjected = cloudPrivacy.projectPartnerApplicationItem(maliciousApplication, maliciousUser, { partner_name: '甲' })
const cloudJson = JSON.stringify(cloudProjected)
assert.ok(!cloudJson.includes('SECRET_PRIVATE_PREF'), 'PARTNER_APPLICATION_DETAIL_NO_PROFILE_SNAPSHOT')
assert.ok(!cloudJson.includes('ab_test_fixture'), 'PARTNER_APPLICATION_LIST_NO_AB_TEST_FIXTURE')
cloudPrivacy.assertPartnerProjectionSafe(cloudProjected)

const app = sanitizePartnerApplication(maliciousApplication)
assert.strictEqual(app.profile_snapshot_json, undefined)
assert.strictEqual(app.raw_ai, undefined)
assert.ok(app.profile_summary)

const partnerJsCloud = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/backoffice.js'), 'utf8')
// PARTNER_APPLICATION_LIST_NO_RAW_APPLICATION_SPREAD
assert.ok(partnerJsCloud.includes('projectPartnerApplicationItem'))
assert.ok(partnerJsCloud.includes("actor.role === 'partner'"))
assert.ok(/if \(actor\.role === 'partner'\)[\s\S]*projectPartnerApplicationItem/.test(partnerJsCloud))
assert.ok(!/actor\.role === 'partner'[\s\S]{0,200}Object\.assign\(\{\}, application/.test(partnerJsCloud),
  'PARTNER_APPLICATION_LIST_NO_RAW_APPLICATION_SPREAD')

const adminHtml = fs.readFileSync(path.join(root, 'server/public/admin/index.html'), 'utf8')
const partnerHtml = fs.readFileSync(path.join(root, 'server/public/partner/index.html'), 'utf8')
const partnerRoute = fs.readFileSync(path.join(root, 'server/src/routes/partner.js'), 'utf8')
const authRoute = fs.readFileSync(path.join(root, 'server/src/routes/auth.js'), 'utf8')
const agentBackoffice = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/agent/backofficeService.js'), 'utf8')
const adminRbacSrc = fs.readFileSync(path.join(root, 'server/src/utils/adminRbac.js'), 'utf8')

// STATUS_COPY_PRESENT / NEXT_ACTION_PRESENT
assert.strictEqual(memberStatusCopy('pending_review').label, '待审核')
assert.ok(memberStatusCopy('pending_review').next)
assert.ok(coordinationStatusCopy('pending_confirmation').label.includes('确认') || coordinationStatusCopy('pending_confirmation').next)
assert.strictEqual(matchLifecycleCopy('no_match').label, '本轮暂无合适匹配')
assert.strictEqual(humanError('TOKEN_EXPIRED'), '登录已过期，请重新登录')
assert.strictEqual(humanError('STALE_COORDINATION_VERSION').includes('刚刚更新'), true)

assert.ok(adminHtml.includes('今日待办'))
assert.ok(adminHtml.includes('todo-hero') || adminHtml.includes('todo-grid'))
assert.ok(adminHtml.includes('优先处理'))
assert.ok(adminHtml.includes('AI服务'))
assert.ok(adminHtml.includes('状态未知') || adminHtml.includes('status_text'))
assert.ok(adminHtml.includes('window.go = navTo'))
assert.ok(adminHtml.includes('nav-group'))
assert.ok(adminHtml.includes('仅内部处理 · 不向 B 展示'))
assert.ok(adminHtml.includes('仅内部处理 · 不向 A 展示'))
assert.ok(adminHtml.includes('双方共享进度'))
assert.ok(adminHtml.includes('coordinationOperatorHtml') || adminHtml.includes('operator_view') || adminHtml.includes('等待 B 确认'))

assert.ok(partnerHtml.includes('今天需要处理'))
assert.ok(partnerHtml.includes('phone_masked') || partnerHtml.includes('已脱敏'))
assert.ok(partnerHtml.includes('隐私提示'))
assert.ok(partnerHtml.includes("confirm('确认申请提现"))
assert.ok(partnerHtml.includes('__auditBusy'))
assert.ok(!/esc\(u\.phone\s*\|\|/.test(partnerHtml), 'partner list must not show full phone field')

assert.ok(partnerRoute.includes('promote_partner_id = ?'))
assert.ok(partnerJsCloud.includes('无权查看其他合伙人的会员申请'))
assert.ok(partnerJsCloud.includes('projectPartnerApplicationItem') || partnerJsCloud.includes('sanitizePartnerUser'))
assert.ok(authRoute.includes('phone_masked'))

assert.ok(adminHtml.includes("adminRole() === 'super_admin'"))
assert.ok(adminHtml.includes('仅超级管理员可见') || adminHtml.includes('OpenID（技术信息）'))
assert.ok(adminHtml.includes('确认处理这笔提现'))
assert.ok(partnerHtml.includes('确认申请提现'))
assert.ok(!/SELECT[\s\S]*u\.openid[\s\S]*FROM `user` u/.test(partnerRoute.replace(/\n/g, ' ')))

// RBAC negative matrix
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.AUDITOR, 'GET', '/member-applications')), true, 'AUDITOR_MEMBER_REVIEW_ALLOWED')
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.AUDITOR, 'PUT', '/member-applications/1/review')), true)
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.AUDITOR, 'PUT', '/withdrawals/1')), false, 'AUDITOR_WITHDRAW_DENIED')
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.AUDITOR, 'GET', '/chat/sessions')), false, 'AUDITOR_AGENT_CONVERSATION_DENIED')
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.FINANCE, 'PUT', '/withdrawals/1')), true, 'FINANCE_WITHDRAW_ALLOWED')
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.FINANCE, 'GET', '/withdrawals')), true)
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.FINANCE, 'PUT', '/member-applications/1/review')), false, 'FINANCE_MEMBER_REVIEW_DENIED')
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.FINANCE, 'GET', '/chat/sessions')), false, 'FINANCE_AGENT_CONVERSATION_DENIED')
assert.strictEqual(canSeeOpenId(ADMIN_ROLES.CUSTOMER_SERVICE), false)
assert.strictEqual(canSeeOpenId(ADMIN_ROLES.AUDITOR), false)
assert.strictEqual(canSeeOpenId(ADMIN_ROLES.FINANCE), false)
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.SUPER_ADMIN, 'GET', '/users')), true, 'SUPER_ADMIN_EXPECTED_ACCESS')
assert.strictEqual(hasRouteAccess(fakeReq(ADMIN_ROLES.SUPER_ADMIN, 'PUT', '/withdrawals/1')), true)
assert.ok(AUDITOR_RULES.length > 0 && FINANCE_RULES.length > 0)
assert.ok(adminRbacSrc.includes('AUDITOR_RULES') && adminRbacSrc.includes('FINANCE_RULES'))
assert.ok(agentBackoffice.includes("requireRole(actor, ['super_admin', 'customer_service'])"))
assert.ok(!/listConversations[\s\S]{0,80}auditor/.test(agentBackoffice))

const {
  formatOrderForService,
  formatOrderForFinance,
  formatHandoffTicketForService,
  formatMatchForService,
  formatWithdrawForFinance,
  formatUserDetailForAuditor,
  formatChatSessionForService,
  formatOrderByRole,
  formatHandoffTicket,
  formatMatchByRole
} = require('../src/utils/roleDataProjection')

const maliciousIdentity = {
  id: 9,
  order_no: 'ORD-1',
  user_id: 2,
  match_log_id: 7,
  match_user_id: 3,
  partner_id: 4,
  partner_name: '合伙人',
  partner_phone: '13800138000',
  phone: '13800138000',
  amount: 188,
  price: 188,
  pay_status: 1,
  settle_status: 0,
  partner_commission: 94,
  status: 'submitted',
  service_note: '跟进',
  openid: 'SECRET_OPENID',
  user_openid: 'SECRET_USER_OPENID',
  match_user_openid: 'SECRET_MATCH_OPENID',
  matched_openid: 'SECRET_MATCH_OPENID',
  unionid: 'SECRET_UNIONID',
  city: '深圳',
  user_city: '深圳',
  match_user_city: '广州',
  create_time: '2026-08-21',
  update_time: '2026-08-21',
  pay_time: '2026-08-21',
  gender: 1,
  last_log_id: 1,
  last_time: '2026-08-21'
}

function assertNoSecrets(payload, label) {
  const text = JSON.stringify(payload)
  for (const token of [
    'SECRET_OPENID',
    'SECRET_USER_OPENID',
    'SECRET_MATCH_OPENID',
    'SECRET_UNIONID',
    '13800138000'
  ]) {
    assert.ok(!text.includes(token), `${label} must not include ${token}`)
  }
  assert.ok(!/\bopenid\b/i.test(text) || !/"openid"\s*:/.test(text), `${label} must not expose openid key with secret`)
}

const csOrder = formatOrderForService(maliciousIdentity)
assertNoSecrets(csOrder, 'CUSTOMER_SERVICE_ORDER_NO_OPENID')
assert.strictEqual(csOrder.openid, undefined)

const csHandoff = formatHandoffTicketForService(maliciousIdentity)
assertNoSecrets(csHandoff, 'CUSTOMER_SERVICE_HANDOFF_NO_OPENID')
assert.strictEqual(csHandoff.user_openid, undefined)
assert.strictEqual(csHandoff.match_user_openid, undefined)

const csMatch = formatMatchForService(maliciousIdentity)
assertNoSecrets(csMatch, 'CUSTOMER_SERVICE_MATCH_NO_OPENID')
assert.strictEqual(csMatch.user_openid, undefined)
assert.strictEqual(csMatch.matched_openid, undefined)

const csWorkbench = {
  chat_sessions: [formatChatSessionForService(maliciousIdentity)],
  handoff_tickets: [formatHandoffTicket(maliciousIdentity, ADMIN_ROLES.CUSTOMER_SERVICE)],
  orders: [formatOrderByRole(maliciousIdentity, ADMIN_ROLES.CUSTOMER_SERVICE)]
}
assertNoSecrets(csWorkbench, 'CUSTOMER_SERVICE_WORKBENCH_NO_OPENID')

const financeOrder = formatOrderForFinance(maliciousIdentity)
assertNoSecrets(financeOrder, 'FINANCE_ORDER_NO_OPENID')
assert.strictEqual(financeOrder.openid, undefined)

const financeWithdraw = formatWithdrawForFinance(maliciousIdentity)
assertNoSecrets(financeWithdraw, 'FINANCE_WITHDRAW_PHONE_MASKED')
assert.strictEqual(financeWithdraw.partner_phone_masked, '138****8000')
assert.strictEqual(financeWithdraw.partner_phone, undefined)
assert.ok(!JSON.stringify(financeWithdraw).includes('13800138000'))

const auditorDetail = formatUserDetailForAuditor({
  id: 2,
  openid: 'SECRET_OPENID',
  unionid: 'SECRET_UNIONID',
  phone: '13800138000',
  city: '深圳',
  gender: 1,
  birth_year: 1995,
  member_status: 'pending_review',
  status: 0,
  promote_partner_id: 8
}, {
  latestAuth: { auth_service: 1, auth_privacy: 1, auth_data: 0, device_info: 'SECRET_DEVICE' },
  partner_name: '合伙人甲',
  match_settings: { prefer_age_min: 20 },
  privacy_auth_logs: [{ id: 1, raw: 'SECRET_LOG' }]
})
assertNoSecrets(auditorDetail, 'AUDITOR_USER_DETAIL_NO_OPENID')
assert.strictEqual(auditorDetail.match_settings, undefined, 'AUDITOR_USER_DETAIL_NO_MATCH_SETTINGS')
assert.strictEqual(auditorDetail.privacy_auth_logs, undefined, 'AUDITOR_USER_DETAIL_NO_RAW_PRIVACY_LOGS')
assert.ok(auditorDetail.agreements_status)
assert.ok(!JSON.stringify(auditorDetail).includes('SECRET_DEVICE'))
assert.ok(!JSON.stringify(auditorDetail).includes('prefer_age_min'))

const adminRoutes = fs.readFileSync(path.join(root, 'server/src/routes/admin.js'), 'utf8')
assert.ok(adminRoutes.includes('formatOrderByRole'))
assert.ok(adminRoutes.includes('formatMatchByRole'))
assert.ok(adminRoutes.includes('formatUserDetailForAuditor'))
assert.ok(adminRoutes.includes('formatChatSessionForService'))
assert.ok(!/orders: orderRows\.map\(formatOrderForService\)[\s\S]{0,40}openid/.test(adminRoutes))

// CUSTOMER_SERVICE_OPENID_DENIED only after real DTO payload checks pass
assert.strictEqual(canSeeOpenId(ADMIN_ROLES.CUSTOMER_SERVICE), false)
assertNoSecrets(formatMatchByRole(maliciousIdentity, ADMIN_ROLES.CUSTOMER_SERVICE), 'CUSTOMER_SERVICE_OPENID_DENIED')

// ROLE_PAGES alignment
assert.ok(adminHtml.includes("auditor: ['dashboard', 'members', 'users', 'partners']"))
assert.ok(adminHtml.includes("finance: ['dashboard', 'orders', 'withdrawals']"))

// AI ops truthful
const unknownOps = buildAiOps({ query_failed: true })
assert.strictEqual(unknownOps.status, 'unknown', 'AI_OPS_QUERY_FAILURE_IS_UNKNOWN')
assert.strictEqual(unknownOps.status_text, '状态未知')
assert.strictEqual(unknownOps.provider, null)
assert.strictEqual(unknownOps.model, null)
const noRunOps = buildAiOps({ data_available: true, failed_today: 0, has_any_run: false })
assert.strictEqual(noRunOps.status, 'unknown', 'AI_OPS_NO_RUN_DATA_NOT_FAKE_NORMAL')
assert.notStrictEqual(noRunOps.status_text, '正常')
const healthyOps = buildAiOps({
  data_available: true,
  failed_today: 0,
  provider: 'CloudBase',
  model: 'HY3-real',
  last_run_at: '2026-08-21T00:00:00Z',
  has_any_run: true
})
assert.strictEqual(healthyOps.status, 'normal', 'AI_OPS_ACTUAL_PROVIDER_MODEL_IF_AVAILABLE')
assert.strictEqual(healthyOps.provider, 'CloudBase')
assert.strictEqual(healthyOps.model, 'HY3-real')
const degradedOps = buildAiOps({ data_available: true, failed_today: 2, provider: 'X', model: 'Y', has_any_run: true })
assert.strictEqual(degradedOps.status, 'degraded')
assert.strictEqual(degradedOps.status_text, '异常')

// Coordination operator view
const coordView = buildCoordinationOperatorView({
  id: 12,
  user_a_id: 1,
  user_b_id: 2,
  status: 'waiting_confirmations',
  coordination_version: 4
}, {
  confirmations: [
    { user_id: 1, decision: 'confirm', coordination_version: 4 },
    { user_id: 2, decision: 'confirm', coordination_version: 3 }
  ],
  a_ref: 'WF-U-000001',
  b_ref: 'WF-U-000002',
  coordination_ref: 'WF-D-12'
})
assert.strictEqual(coordView.proposal_version_text, '第 4 版')
assert.strictEqual(coordView.side_a.confirmed, true)
assert.strictEqual(coordView.side_b.confirmed, false)
assert.ok(coordView.display_status.includes('B') || coordView.display_status.includes('等待'))
assert.ok(coordView.stale_notice.includes('方案已经更新'))

results.RESPONSE_DATA_AUTHORIZATION = 'PASS'
results.ROUTE_AUTHORIZATION = 'PASS'

console.log('PASS backoffice-simple-web-final')
console.log('PASS PARTNER_PHONE_MASKED')
console.log('PASS PARTNER_NO_OPENID')
console.log('PASS PARTNER_NO_PRIVATE_AI_CONTENT')
console.log('PASS PARTNER_APPLICATION_LIST_NO_PROFILE_SNAPSHOT')
console.log('PASS PARTNER_APPLICATION_LIST_NO_RAW_APPLICATION_SPREAD')
console.log('PASS PARTNER_APPLICATION_LIST_NO_AB_TEST_FIXTURE')
console.log('PASS PARTNER_APPLICATION_DETAIL_NO_PROFILE_SNAPSHOT')
console.log('PASS PARTNER_APPLICATION_LIST_ALLOWLIST_ONLY')
console.log('PASS PARTNER_SCOPE_ENFORCED')
console.log('PASS LOWER_ADMIN_NO_OPENID')
console.log('PASS DANGEROUS_ACTION_CONFIRMATION')
console.log('PASS STATUS_COPY_PRESENT')
console.log('PASS NEXT_ACTION_PRESENT')
console.log('PASS AUDITOR_MEMBER_REVIEW_ALLOWED')
console.log('PASS AUDITOR_WITHDRAW_DENIED')
console.log('PASS AUDITOR_AGENT_CONVERSATION_DENIED')
console.log('PASS FINANCE_WITHDRAW_ALLOWED')
console.log('PASS FINANCE_MEMBER_REVIEW_DENIED')
console.log('PASS FINANCE_AGENT_CONVERSATION_DENIED')
console.log('PASS CUSTOMER_SERVICE_ORDER_NO_OPENID')
console.log('PASS CUSTOMER_SERVICE_HANDOFF_NO_OPENID')
console.log('PASS CUSTOMER_SERVICE_WORKBENCH_NO_OPENID')
console.log('PASS CUSTOMER_SERVICE_MATCH_NO_OPENID')
console.log('PASS FINANCE_ORDER_NO_OPENID')
console.log('PASS FINANCE_WITHDRAW_PHONE_MASKED')
console.log('PASS AUDITOR_USER_DETAIL_NO_OPENID')
console.log('PASS AUDITOR_USER_DETAIL_NO_MATCH_SETTINGS')
console.log('PASS AUDITOR_USER_DETAIL_NO_RAW_PRIVACY_LOGS')
console.log('PASS CUSTOMER_SERVICE_OPENID_DENIED')
console.log('PASS SUPER_ADMIN_EXPECTED_ACCESS')
console.log('PASS ROUTE_AUTHORIZATION')
console.log('PASS RESPONSE_DATA_AUTHORIZATION')
console.log('PASS AI_OPS_QUERY_FAILURE_IS_UNKNOWN')
console.log('PASS AI_OPS_NO_RUN_DATA_NOT_FAKE_NORMAL')
console.log('PASS AI_OPS_ACTUAL_PROVIDER_MODEL_IF_AVAILABLE')
console.log(JSON.stringify({ results }))
