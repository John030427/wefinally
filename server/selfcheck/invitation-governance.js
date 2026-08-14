const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { resolveInvitation } = require('../../miniprogram/cloudfunctions/api/lib/memberPolicy')
const { partnerDisplayName } = require('../../miniprogram/cloudfunctions/api/lib/partnerDashboardPolicy')
const { assertActivation, normalizePhone } = require('../../miniprogram/cloudfunctions/api/lib/partnerOnboardingPolicy')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

async function main() {
  const partner = { id: 7, status: 1, promote_code: 'WF7' }
  const first = async (name, query) => (
    name === 'partner' && (query.promote_code === 'WF7' || Number(query.id) === 7) ? partner : null
  )
  assert.deepStrictEqual(await resolveInvitation('wf7', first), partner)
  assert.deepStrictEqual(await resolveInvitation(' WF7 ', first), partner)
  await assert.rejects(() => resolveInvitation('DEAD', first), /无效或已停用/)
  await assert.rejects(() => resolveInvitation('', first), /邀请码/)

  const userJs = read('miniprogram/cloudfunctions/api/handlers/user.js')
  const registerFn = userJs.slice(userJs.indexOf('async function register'), userJs.indexOf('async function getProfile'))
  assert(registerFn.includes('ensureReferralAttribution'))
  assert(registerFn.includes('PENDING_PROFILE'))
  assert(!registerFn.includes("addWithId('partner'"))
  assert(!registerFn.includes('signBackofficeToken'))
  assert(!registerFn.includes("role: 'partner'"))
  assert(!registerFn.includes('used: true'))
  assert(!registerFn.includes('remaining_uses'))

  const onboarding = read('miniprogram/cloudfunctions/api/lib/partnerOnboardingPolicy.js')
  const activationFn = onboarding.slice(onboarding.indexOf('function assertActivation'), onboarding.indexOf('function candidateDto'))
  assert(onboarding.includes("source !== 'roster'"))
  assert(!activationFn.includes('promote_code'))
  assert.throws(() => normalizePhone('WF7'), /手机号格式无效/)
  assert.throws(() => assertActivation({
    candidate: { source: 'roster', review_status: 'approved', activation_status: 'unbound', phone_digest: 'x' },
    rosterPhone: 'WF7',
    currentUserId: 7,
    secret: 'partner-phone-lookup-secret-for-selfcheck-2026'
  }), /手机号格式无效|未获资格/)

  assert.strictEqual(partnerDisplayName({ name: '核验姓名' }), '合伙人')
  assert.strictEqual(partnerDisplayName({ name: '  ' }), '合伙人')
  assert.strictEqual(partnerDisplayName({}), '合伙人')
  assert.notStrictEqual(partnerDisplayName({}), 'Grace')

  const inviteWxml = read('miniprogram/pages/partner-invite/partner-invite.wxml')
  const inviteJs = read('miniprogram/pages/partner-invite/partner-invite.js')
  const registerWxml = read('miniprogram/pages/register/register.wxml')
  const dashboardPolicy = read('miniprogram/cloudfunctions/api/lib/partnerDashboardPolicy.js')
  const commonHandler = read('miniprogram/cloudfunctions/api/handlers/common.js')

  assert(inviteWxml.includes('一键分享给微信好友'))
  assert(inviteWxml.includes('复制公开邀请码（可多人使用）'))
  assert(inviteWxml.includes("partner.name || '合伙人'") || inviteWxml.includes('partner.display_name'))
  assert(!inviteWxml.includes('WeFinally 合伙人'))
  assert(!inviteJs.includes('Grace'))
  assert(!inviteWxml.includes('Grace'))
  assert(!dashboardPolicy.includes("'Grace'") && !dashboardPolicy.includes('"Grace"'))
  assert(commonHandler.includes("message: '已识别合伙人推广码'"))
  assert(!commonHandler.includes('partner.name'))
  assert(registerWxml.includes('公开邀请码'))
  assert(registerWxml.includes('用于确认邀请来源，不会自动成为合伙人'))

  console.log('PASS reusable public invite codes stay attribution-only and never default to Grace')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
