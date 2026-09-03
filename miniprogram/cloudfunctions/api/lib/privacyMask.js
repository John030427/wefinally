'use strict'

/**
 * Partner-facing allowlist projection for member applications.
 * Never spreads raw application documents.
 */

function maskPhone(phone) {
  const raw = String(phone || '').trim()
  if (!raw) return ''
  if (raw.includes('*')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  if (raw.length <= 4) return '****'
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`
}

function sanitizePartnerUser(user) {
  if (!user) return null
  return {
    id: user.id,
    support_code: user.support_code || null,
    gender: user.gender,
    birth_year: user.birth_year,
    education: user.education,
    city: user.city,
    occupation_description: user.occupation_description || '',
    member_status: user.member_status,
    is_vip: Number(user.is_vip || 0),
    vip_expire_time: user.vip_expire_time || null,
    vip_source: user.vip_source || '',
    phone_masked: maskPhone(user.phone || '')
  }
}

function sanitizePartnerApplication(application) {
  if (!application) return null
  return {
    id: application.id,
    user_id: application.user_id,
    status: application.status,
    revision: application.revision,
    review_note: application.review_note || '',
    submitted_at: application.submitted_at || application.create_time || application.created_at || null,
    reviewed_at: application.reviewed_at || null,
    profile_summary: {
      city: application.city || null,
      education: application.education || null,
      occupation: application.occupation || application.occupation_description || null,
      birth_year: application.birth_year || null,
      completeness_hint: application.completeness_hint || application.missing_fields || null
    }
  }
}

function partnerApplicationNextAction(status) {
  if (status === 'pending_review') return '请审核：通过 / 需要补充资料 / 不通过'
  if (status === 'need_more_info') return '等待用户补充资料'
  if (status === 'approved') return '已通过，可继续跟进推广用户'
  if (status === 'rejected') return '已驳回'
  if (status === 'disabled') return '已停用'
  return '查看后可按当前状态继续处理'
}

/**
 * Allowlist-only list/detail item for partner. Never Object.assign raw application.
 */
function projectPartnerApplicationItem(application, user, extras) {
  const base = sanitizePartnerApplication(application) || {}
  const out = Object.assign({}, base, {
    user: sanitizePartnerUser(user),
    next_action: partnerApplicationNextAction(application && application.status),
    privacy_notice: '仅内部处理：请勿向他人泄露用户私人资料'
  })
  if (extras && extras.partner_name) out.partner_name = String(extras.partner_name)
  return out
}

function assertPartnerProjectionSafe(payload) {
  const text = JSON.stringify(payload || {})
  const banned = [
    'profile_snapshot_json',
    'raw_ai',
    'openid',
    'ab_test_fixture',
    'ab_test_run_id',
    'SECRET_PRIVATE_PREF',
    'SECRET_AI',
    'SECRET_OPENID',
    'SECRET_TEST',
    'reviewed_by_id',
    'reviewed_by_role'
  ]
  for (const token of banned) {
    if (text.includes(token)) {
      throw new Error(`partner projection leaked sensitive token: ${token}`)
    }
  }
  return true
}

module.exports = {
  maskPhone,
  sanitizePartnerUser,
  sanitizePartnerApplication,
  partnerApplicationNextAction,
  projectPartnerApplicationItem,
  assertPartnerProjectionSafe
}
