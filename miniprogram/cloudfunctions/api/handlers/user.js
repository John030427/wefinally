const { col, first, byId, addWithId, updateByDoc, ensureUserSupportCode, authError, now } = require('../lib/db')
const { tokenFor } = require('./auth')
const { isVipActive } = require('../lib/format')
const { ensureReferralAttribution } = require('../lib/partnerReferralAttributionPolicy')
const {
  MEMBER_STATUS,
  memberStatus,
  normalizeOccupation,
  resolveInvitation
} = require('../lib/memberPolicy')
const { resolveTestIdentity } = require('../lib/testIdentityPolicy')
const { flagEnabled } = require('../lib/flags')

async function currentUser(wxContext) {
  const openid = wxContext.OPENID
  if (!openid) throw authError('无法获取微信身份')
  const user = await first('user', { openid })
  if (!user) throw authError('请先登录')
  return user
}

async function circleName(circleId) {
  const circle = await byId('occupation_circle', circleId)
  return circle ? (circle.circle_name || circle.name || '') : ''
}

async function profilePayload(user) {
  const [setting, supportCode, publicTestRunEnabled] = await Promise.all([
    first('user_match_setting', { user_id: user.id }),
    ensureUserSupportCode(user),
    flagEnabled('match_test_run_public_enabled')
  ])
  const identity = resolveTestIdentity(user)
  return Object.assign({}, user, {
    support_code: supportCode,
    circle_name: user.circle_name || await circleName(user.circle_id),
    is_vip: isVipActive(user) ? 1 : 0,
    isVip: isVipActive(user),
    match_settings: setting || null,
    member_status: memberStatus(user),
    account_mode: identity.account_mode,
    identity_kind: identity.kind,
    qa_test_run_enabled: identity.kind === 'internal_qa' || publicTestRunEnabled
  })
}

function parseGender(value) {
  if (value === '男' || Number(value) === 1) return 1
  if (value === '女' || Number(value) === 2) return 2
  return 0
}

async function register(data, wxContext) {
  const openid = wxContext.OPENID || data.openid
  if (!openid) throw new Error('缺少 openid')
  const existing = await first('user', { openid })
  if (existing) {
    if (Number(existing.promote_partner_id || 0) > 0) {
      await ensureReferralAttribution(
        existing,
        { id: existing.promote_partner_id, promote_code: existing.promote_code },
        existing.promote_code,
        { first, addWithId, now }
      )
    }
    return {
      token: tokenFor(openid),
      user: await profilePayload(existing)
    }
  }

  const partner = await resolveInvitation(data.promote_code, first)
  const occupation = normalizeOccupation({
    circleId: data.circle_id,
    description: data.occupation_description
  })
  const normalizedPromoteCode = String(partner.promote_code || data.promote_code).trim().toUpperCase()
  const createdAt = now()

  const user = await addWithId('user', {
    openid,
    gender: parseGender(data.gender),
    birth_year: Number(data.birth_year),
    height_range: data.height_range || '',
    education: data.education || '',
    circle_id: occupation.circleId,
    occupation_description: occupation.description,
    city: data.city || '深圳',
    marry_status: data.marry_status || '未婚',
    baby_plan: data.baby_plan || '',
    income_range: data.income_range || '',
    house_car: data.house_car || '',
    status: 1,
    member_status: MEMBER_STATUS.PENDING_PROFILE,
    member_status_updated_at: createdAt,
    is_vip: 0,
    vip_expire_time: null,
    promote_partner_id: Number(partner.id),
    promote_code: normalizedPromoteCode,
    free_member: 0,
    free_source: '',
    appearance_description: data.appearance_description || '',
    appearance_want: '',
    appearance_tags: '',
    appearance_want_tags: '',
    last_match_setting_time: null
  }, 'user')

  await ensureReferralAttribution(user, partner, data.promote_code, { first, addWithId, now })

  await addWithId('user_match_setting', {
    user_id: user.id,
    last_edit_time: null
  }, 'match_setting')

  try {
    await addWithId('user_privacy_auth_log', {
      openid,
      user_id: user.id,
      auth_service: 1,
      auth_privacy: 1,
      auth_data: 1,
      device_info: data.device_info || '',
      auth_time: now()
    }, 'privacy')
  } catch (err) {
    console.warn('privacy auth log skipped:', err.message || err)
  }

  return {
    token: tokenFor(openid),
    user: await profilePayload(user),
    userInfo: await profilePayload(user)
  }
}

async function getProfile(data, wxContext) {
  return profilePayload(await currentUser(wxContext))
}

async function updateProfile(data, wxContext) {
  const user = await currentUser(wxContext)
  const patch = {}
  const allowed = [
    'city', 'education', 'income_range', 'house_car', 'baby_plan',
    'height_range', 'appearance_description', 'appearance_want',
    'circle_id', 'occupation_description'
  ]
  if (memberStatus(user) !== MEMBER_STATUS.APPROVED) allowed.push('birth_year')
  allowed.forEach((key) => {
    if (data[key] !== undefined) patch[key] = data[key]
  })
  const updated = await updateByDoc('user', user, patch)
  return profilePayload(updated)
}

async function marryReport(data, wxContext) {
  const user = await currentUser(wxContext)
  const report = await addWithId('marry_report', {
    user_id: user.id,
    openid: user.openid,
    report_type: 1,
    proof_img: data.proof_img || '',
    contact_phone: data.contact_phone || '',
    review_note: data.review_note || '',
    reject_reason: '',
    audit_status: 0
  }, 'marry_report')
  return report
}

async function cancel(data, wxContext) {
  const user = await currentUser(wxContext)
  const cancelledAt = now()
  const deleteAfter = new Date(cancelledAt.getTime() + 15 * 24 * 60 * 60 * 1000)
  await updateByDoc('user', user, { status: 3, cancel_time: cancelledAt })
  const taskRedaction = {
    status: 'cancelled',
    reports: null,
    input_snapshot: null,
    error_code: 'account_cancelled',
    error_message: '',
    cancelled_at: cancelledAt,
    delete_after: deleteAfter,
    update_time: cancelledAt
  }
  await Promise.all([
    col('ai_report_task').where({ 'user_ids.a': Number(user.id) }).update({ data: taskRedaction }),
    col('ai_report_task').where({ 'user_ids.b': Number(user.id) }).update({ data: taskRedaction }),
    col('user_match_log').where({ user_id: Number(user.id) }).update({ data: {
      ai_report_text: '',
      local_report_text: '',
      ai_report_error: '',
      update_time: cancelledAt
    } }),
    col('user_match_log').where({ match_user_id: Number(user.id) }).update({ data: {
      ai_report_text: '',
      local_report_text: '',
      ai_report_error: '',
      update_time: cancelledAt
    } })
  ])
  return { submitted: true }
}

async function claimFree(data, wxContext) {
  const user = await currentUser(wxContext)
  const code = String(data.activation_code || data.phone || '').trim()
  if (!code) throw new Error('请输入激活码')
  const wl = await first('free_whitelist', { phone: code })
  if (!wl || Number(wl.used || 0) === 1) throw new Error('激活码无效或已使用')
  await updateByDoc('free_whitelist', wl, { used: 1 })
  const updated = await updateByDoc('user', user, {
    free_member: 1,
    free_source: wl.source || 'activation',
    status: 1
  })
  return profilePayload(updated)
}

async function divorceReviewStatus(data, wxContext) {
  const openid = data.openid || wxContext.OPENID
  if (!openid) throw new Error('缺少 openid')
  const row = await first('marry_report', { openid, report_type: 2 })
  if (!row) return { status: 'none', audit_status: -1 }
  return Object.assign({}, row, {
    status: row.audit_status === 1 ? 'approved' : (row.audit_status === 2 ? 'rejected' : 'pending')
  })
}

async function submitDivorceReview(data, wxContext) {
  const openid = data.openid || wxContext.OPENID
  if (!openid) throw new Error('缺少 openid')
  return addWithId('marry_report', {
    user_id: 0,
    openid,
    report_type: 2,
    proof_img: '',
    contact_phone: data.contact_phone || '',
    review_note: data.review_note || '',
    reject_reason: '',
    audit_status: 0
  }, 'marry_report')
}

module.exports = {
  currentUser,
  profilePayload,
  register,
  getProfile,
  updateProfile,
  marryReport,
  cancel,
  claimFree,
  divorceReviewStatus,
  submitDivorceReview
}
