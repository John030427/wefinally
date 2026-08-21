'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const { maskPhone, sanitizePartnerUser, sanitizePartnerSelf, sanitizePartnerApplication } = require('../src/utils/privacyMask')
const { memberStatusCopy, coordinationStatusCopy, matchLifecycleCopy, humanError } = require('../src/utils/statusCopy')
const { formatPartnerUser, formatPartnerForAdmin } = require('../src/utils/apiFormat')

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

// PARTNER_NO_PRIVATE_AI_CONTENT
const app = sanitizePartnerApplication({
  id: 3,
  user_id: 9,
  status: 'pending_review',
  profile_snapshot_json: { secret: true },
  raw_ai: 'should not leak',
  city: '深圳'
})
assert.strictEqual(app.profile_snapshot_json, undefined)
assert.strictEqual(app.raw_ai, undefined)
assert.ok(app.profile_summary)

const adminHtml = fs.readFileSync(path.join(root, 'server/public/admin/index.html'), 'utf8')
const partnerHtml = fs.readFileSync(path.join(root, 'server/public/partner/index.html'), 'utf8')
const partnerJsCloud = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/backoffice.js'), 'utf8')
const partnerRoute = fs.readFileSync(path.join(root, 'server/src/routes/partner.js'), 'utf8')
const authRoute = fs.readFileSync(path.join(root, 'server/src/routes/auth.js'), 'utf8')

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
assert.ok(adminHtml.includes('window.go = navTo'))
assert.ok(adminHtml.includes('nav-group'))

assert.ok(partnerHtml.includes('今天需要处理'))
assert.ok(partnerHtml.includes('phone_masked') || partnerHtml.includes('已脱敏'))
assert.ok(partnerHtml.includes('隐私提示'))
assert.ok(partnerHtml.includes("confirm('确认申请提现"))
assert.ok(partnerHtml.includes('__auditBusy'))
assert.ok(!/esc\(u\.phone\s*\|\|/.test(partnerHtml), 'partner list must not show full phone field')

// PARTNER_SCOPE_ENFORCED (route still scopes by promote_partner_id / assigned_partner_id)
assert.ok(partnerRoute.includes('promote_partner_id = ?'))
assert.ok(partnerJsCloud.includes('无权查看其他合伙人的会员申请'))
assert.ok(partnerJsCloud.includes('sanitizePartnerUser'))
assert.ok(authRoute.includes('phone_masked'))

// LOWER_ADMIN_NO_OPENID (UI collapses OpenID for non-super)
assert.ok(adminHtml.includes("adminRole() === 'super_admin'"))
assert.ok(adminHtml.includes('仅超级管理员可见') || adminHtml.includes('OpenID（技术信息）'))

// DANGEROUS_ACTION_CONFIRMATION
assert.ok(adminHtml.includes('确认处理这笔提现'))
assert.ok(partnerHtml.includes('确认申请提现'))

// Partner API SELECT must not request openid for list
assert.ok(!/SELECT[\s\S]*u\.openid[\s\S]*FROM `user` u/.test(partnerRoute.replace(/\n/g, ' ')))

console.log('PASS backoffice-simple-web-final')
console.log('PASS PARTNER_PHONE_MASKED')
console.log('PASS PARTNER_NO_OPENID')
console.log('PASS PARTNER_NO_PRIVATE_AI_CONTENT')
console.log('PASS PARTNER_SCOPE_ENFORCED')
console.log('PASS LOWER_ADMIN_NO_OPENID')
console.log('PASS DANGEROUS_ACTION_CONFIRMATION')
console.log('PASS STATUS_COPY_PRESENT')
console.log('PASS NEXT_ACTION_PRESENT')
