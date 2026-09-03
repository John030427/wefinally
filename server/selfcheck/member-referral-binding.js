const assert = require('assert')
const { createReferralToken } = require('../../miniprogram/cloudfunctions/api/lib/partnerReferralPolicy')
const { createMemberHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/member')

process.env.PARTNER_REFERRAL_SECRET = 'wf-selfcheck-referral-secret'

function scenario(referral, options = {}) {
  let user = {
    _id: 'user_18', id: 18, status: 1, member_status: 'pending_review',
    promote_partner_id: 0, promote_code: '', gender: 2, birth_year: 1995,
    height_range: '160-170cm', education: '本科', circle_id: 3,
    occupation_description: '', city: '深圳', marry_status: '未婚', baby_plan: '2-3年内'
  }
  if (options.incomplete) user.baby_plan = ''
  let application = {
    _id: 'member_application_31', id: 31, user_id: 18,
    status: 'pending_review', inviter_partner_id: Number(options.assignedPartnerId || 0),
    assigned_partner_id: Number(options.assignedPartnerId || 0),
    revision: 1
  }
  let attribution = null
  const audits = []
  const partner = { _id: 'partner_7', id: 7, status: 1, promote_code: 'WFP0007' }

  const deps = {
    currentUser: async () => ({ ...user }),
    first: async (name, query) => {
      if (name === 'user_match_setting') return {
        user_id: 18, age_min: 25, age_max: 38, height_min: 165, height_max: 190,
        min_education: '本科', like_marry_status: '仅看未婚', like_baby_plan: '2-3年内',
        self_view_text: '我重视坦诚沟通、稳定关系和共同成长，希望认真经营长期关系。',
        target_view_text: '期待对方愿意坦诚沟通，对婚姻负责，并能一起规划未来生活。'
      }
      if (name === 'partner_referral_attribution') return attribution
      if (name === 'partner' && Number(query.id) === 7) return partner
      if (name === 'partner' && query.promote_code === 'WFP0007') return partner
      return null
    },
    list: async (name) => name === 'member_application' ? [{ ...application }] : [],
    byId: async (name, id) => name === 'partner' && Number(id) === 7 ? partner : null,
    addWithId: async (name, data) => {
      const row = { _id: `${name}_${data.user_id || audits.length + 1}`, id: data.user_id || audits.length + 1, ...data }
      if (name === 'partner_referral_attribution') attribution = row
      if (name === 'partner_user_audit_log') audits.push(row)
      return row
    },
    updateByDoc: async (name, doc, patch) => {
      if (name === 'user') user = { ...user, ...patch }
      if (name === 'member_application') application = { ...application, ...patch }
      return { ...doc, ...patch }
    },
    now: () => new Date('2026-09-01T08:00:00.000Z')
  }
  deps.transaction = async (work) => work(deps)
  return {
    handlers: createMemberHandlers(deps),
    referral,
    read: () => ({ user, application, attribution, audits })
  }
}

async function main() {
  const ordinary = scenario('WFP0007')
  const ordinaryResult = await ordinary.handlers.bindReferral({ referral: ordinary.referral }, {})
  const ordinaryState = ordinary.read()
  assert.strictEqual(ordinaryResult.member_status, 'pending_review')
  assert.strictEqual(ordinaryResult.auto_approved, false)
  assert.strictEqual(ordinaryState.user.promote_partner_id, 7)
  assert.strictEqual(ordinaryState.application.assigned_partner_id, 7)
  assert.strictEqual(ordinaryState.attribution.source_type, 'promote_code')

  const signedToken = createReferralToken(7, {
    secret: process.env.PARTNER_REFERRAL_SECRET,
    now: Date.now(),
    ttlMs: 86400000
  })
  const signed = scenario(signedToken)
  const signedResult = await signed.handlers.bindReferral({ referral: signed.referral }, {})
  const signedState = signed.read()
  assert.strictEqual(signedResult.member_status, 'approved')
  assert.strictEqual(signedResult.auto_approved, true)
  assert.strictEqual(signedState.application.status, 'approved')
  assert(signedState.audits.some((row) => row.action === 'auto_approve'))
  const signedAuditCount = signedState.audits.length
  const signedAgain = await signed.handlers.bindReferral({ referral: signed.referral }, {})
  assert.strictEqual(signedAgain.member_status, 'approved')
  assert.strictEqual(signedAgain.idempotent, true)
  assert.strictEqual(signed.read().audits.length, signedAuditCount)

  const locked = scenario('WFP0007')
  await locked.handlers.bindReferral({ referral: 'WFP0007' }, {})
  const auditCount = locked.read().audits.length
  const same = await locked.handlers.bindReferral({ referral: 'WFP0007' }, {})
  assert.strictEqual(same.idempotent, true)
  assert.strictEqual(locked.read().audits.length, auditCount)

  const assignedElsewhere = scenario('WFP0007', { assignedPartnerId: 9 })
  await assert.rejects(
    () => assignedElsewhere.handlers.bindReferral({ referral: 'WFP0007' }, {}),
    /邀请关系已绑定，不能更换合伙人/
  )

  const incomplete = scenario(signedToken, { incomplete: true })
  await assert.rejects(
    () => incomplete.handlers.bindReferral({ referral: signedToken }, {}),
    /请先补充/
  )

  console.log('PASS pending member can bind locked referral and only signed link auto-approves')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
