const {
  MEMBER_STATUS,
  REAPPLY_COOLDOWN_DAYS,
  memberStatus,
  canSubmitApplication,
  missingApplicationFields,
  nextMemberStatus
} = require('../lib/memberPolicy')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    currentUser: require('./user').currentUser,
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    now: db.now
  }
}

function latestApplication(rows) {
  return (rows || []).slice().sort((a, b) => (
    Number(b.revision || 0) - Number(a.revision || 0)
      || new Date(b.create_time || 0).getTime() - new Date(a.create_time || 0).getTime()
  ))[0] || null
}

function snapshot(user, setting) {
  return JSON.stringify({
    profile: {
      gender: user.gender,
      birth_year: user.birth_year,
      height_range: user.height_range,
      education: user.education,
      circle_id: user.circle_id,
      occupation_description: user.occupation_description || '',
      city: user.city,
      marry_status: user.marry_status,
      baby_plan: user.baby_plan,
      income_range: user.income_range || '',
      house_car: user.house_car || '',
      appearance_description: user.appearance_description || ''
    },
    match_setting: setting
  })
}

async function signedReferralAttribution(user, partnerId, dep) {
  const attribution = await dep('first')('partner_referral_attribution', { user_id: Number(user.id) })
  if (!attribution) return null
  if (Number(attribution.partner_id) !== Number(partnerId)) return null
  if (attribution.attribution_locked !== true) return null
  return attribution.source_type === 'signed_token' ? attribution : null
}

async function reviewMemberApplication(input, actor, deps) {
  if (!actor || !['partner', 'admin'].includes(actor.role)) throw new Error('无权审核会员申请')
  const note = String(input.note || '').trim().slice(0, 500)
  if (['need_more_info', 'reject', 'disable'].includes(input.action) && !note) {
    throw new Error('请填写审核意见')
  }
  const execute = async (store) => {
    const application = await store.byId('member_application', Number(input.applicationId || 0))
    if (!application) throw new Error('会员申请不存在')
    if (actor.role === 'partner' && Number(application.assigned_partner_id) !== Number(actor.id)) {
      throw new Error('无权审核其他合伙人的会员申请')
    }
    const fromStatus = String(application.status || '')
    const nextStatus = nextMemberStatus(fromStatus, input.action)
    const user = await store.byId('user', application.user_id)
    if (!user) throw new Error('申请用户不存在')
    const reviewedAt = store.now()
    await store.updateByDoc('member_application', application, {
      status: nextStatus,
      review_note: note,
      reviewed_by_role: actor.role,
      reviewed_by_id: Number(actor.id),
      reviewed_at: reviewedAt
    })
    const updatedUser = await store.updateByDoc('user', user, {
      member_status: nextStatus,
      member_status_updated_at: reviewedAt
    })
    await store.addWithId('partner_user_audit_log', {
      application_id: application.id,
      partner_id: actor.role === 'partner' ? Number(actor.id) : Number(application.assigned_partner_id || 0),
      user_id: application.user_id,
      actor_role: actor.role,
      actor_id: Number(actor.id),
      action: input.action,
      from_status: fromStatus,
      to_status: nextStatus,
      reason: note
    }, 'member_audit')
    return updatedUser
  }
  return typeof deps.transaction === 'function' ? deps.transaction(execute) : execute(deps)
}

function createMemberHandlers(overrides = {}) {
  let defaults = null
  function dep(name) {
    if (overrides[name]) return overrides[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function status(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const rows = await dep('list')('member_application', { user_id: user.id }, 100)
    const latest = latestApplication(rows)
    const submit = canSubmitApplication(user)
    return {
      member_status: memberStatus(user),
      member_status_updated_at: user.member_status_updated_at || null,
      can_submit: submit.allowed,
      reapply_remaining_days: submit.remainingDays,
      reapply_cooldown_days: REAPPLY_COOLDOWN_DAYS,
      review_note: latest ? (latest.review_note || '') : '',
      application: latest
    }
  }

  async function submit(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const eligibility = canSubmitApplication(user)
    if (!eligibility.allowed) {
      if (eligibility.remainingDays > 0) {
        throw new Error(`审核拒绝后需等待${eligibility.remainingDays}天才能重新申请`)
      }
      throw new Error('当前状态不能提交会员申请')
    }
    const partnerId = Number(user.promote_partner_id || 0)
    if (partnerId) {
      const partner = await dep('byId')('partner', partnerId)
      if (!partner || Number(partner.status) !== 1) throw new Error('邀请合伙人当前不可用，请联系平台客服')
    }

    const setting = await dep('first')('user_match_setting', { user_id: user.id }) || {}
    const missing = missingApplicationFields(user, setting)
    if (missing.length) throw new Error(`请先补充：${missing.join('、')}`)

    const rows = await dep('list')('member_application', { user_id: user.id }, 100)
    const latest = latestApplication(rows)
    const now = dep('now')()
    const signedAttribution = partnerId ? await signedReferralAttribution(user, partnerId, dep) : null
    const nextStatus = signedAttribution ? MEMBER_STATUS.APPROVED : MEMBER_STATUS.PENDING_REVIEW
    const application = await dep('addWithId')('member_application', {
      user_id: user.id,
      inviter_partner_id: partnerId,
      assigned_partner_id: partnerId,
      revision: Number(latest && latest.revision || 0) + 1,
      status: nextStatus,
      profile_snapshot_json: snapshot(user, setting),
      review_note: signedAttribution ? '合伙人签名分享邀请，资料完整后自动通过' : '',
      submitted_at: now,
      reviewed_by_role: signedAttribution ? 'partner_referral_auto' : '',
      reviewed_by_id: signedAttribution ? partnerId : 0,
      reviewed_at: signedAttribution ? now : null
    }, 'member_application')
    await dep('updateByDoc')('user', user, {
      member_status: nextStatus,
      member_status_updated_at: now
    })
    if (signedAttribution) {
      await dep('addWithId')('partner_user_audit_log', {
        application_id: application.id,
        partner_id: partnerId,
        user_id: user.id,
        actor_role: 'partner_referral_auto',
        actor_id: partnerId,
        action: 'auto_approve',
        from_status: memberStatus(user),
        to_status: MEMBER_STATUS.APPROVED,
        reason: 'signed_partner_referral'
      }, 'member_audit')
    }
    return application
  }

  return { status, submit }
}

const handlers = createMemberHandlers()

module.exports = {
  status: handlers.status,
  submit: handlers.submit,
  createMemberHandlers,
  latestApplication,
  signedReferralAttribution,
  reviewMemberApplication
}
