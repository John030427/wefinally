'use strict'

/** Shared privacy helpers for admin/partner backoffice APIs. */

function maskPhone(phone) {
  const raw = String(phone || '').trim()
  if (!raw) return ''
  if (raw.includes('*')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 7) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  }
  if (raw.length <= 4) return '****'
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`
}

const PARTNER_USER_DENY = new Set([
  'openid',
  'unionid',
  'session_key',
  'phone',
  'mobile',
  'exact_address',
  'address',
  'unit',
  'work_unit',
  'id_card',
  'id_number',
  'password',
  'profile_snapshot_json',
  'psych_profile_json',
  'ai_report',
  'ai_report_text',
  'raw_ai'
])

function sanitizePartnerUser(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  const g = row.gender
  const genderText = g === 1 || g === '1' ? '男' : g === 2 || g === '2' ? '女' : ''
  const nickname = row.nickname
    || [row.city, genderText, row.birth_year ? `${row.birth_year}年` : ''].filter(Boolean).join('·')
    || `用户${row.id}`
  out.id = row.id
  out.support_code = row.support_code || null
  out.nickname = nickname
  out.gender = row.gender
  out.birth_year = row.birth_year
  out.city = row.city
  out.education = row.education || null
  out.occupation_description = row.occupation_description || ''
  out.status = row.status
  out.member_status = row.member_status
  out.is_vip = Number(row.is_vip || 0)
  out.vip_expire_time = row.vip_expire_time || row.vip_expire_at || null
  out.vip_expire_at = out.vip_expire_time
  out.marry_status = row.marry_status || null
  out.create_time = row.create_time || row.created_at || null
  out.created_at = out.create_time
  out.application_id = row.application_id || null
  out.review_note = row.review_note || null
  out.phone_masked = maskPhone(row.phone || row.phone_masked || '')
  out.display_status = row.member_status || String(row.status ?? '')
  return out
}

function sanitizePartnerSelf(row) {
  if (!row || typeof row !== 'object') return row
  const { password, openid, unionid, ...rest } = row
  return {
    id: rest.id,
    name: rest.name || rest.real_name || '',
    real_name: rest.name || rest.real_name || '',
    username: rest.phone ? maskPhone(rest.phone) : (rest.username || ''),
    phone_masked: maskPhone(rest.phone || rest.phone_masked || ''),
    circle_id: rest.circle_id,
    promote_code: rest.promote_code,
    status: rest.status,
    balance: Number(rest.balance || 0),
    total_commission: Number(rest.total_commission || 0),
    total_promote_user: rest.total_promote_user,
    total_promote_vip: rest.total_promote_vip,
    create_time: rest.create_time || rest.created_at,
    created_at: rest.create_time || rest.created_at,
    update_time: rest.update_time
  }
}

function sanitizePartnerApplication(application) {
  if (!application || typeof application !== 'object') return application
  return {
    id: application.id,
    user_id: application.user_id,
    status: application.status,
    revision: application.revision,
    review_note: application.review_note || '',
    submitted_at: application.submitted_at || application.create_time || application.created_at,
    reviewed_at: application.reviewed_at || null,
    // Grouped audit fields only — no raw snapshot / openid
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

function assertNoSensitivePartnerPayload(payload, label) {
  const text = JSON.stringify(payload || {})
  if (/\bopenid\b/i.test(text)) {
    throw new Error(`${label || 'partner payload'} must not include openid`)
  }
  if (/"phone"\s*:\s*"[^*"]{8,}"/.test(text)) {
    throw new Error(`${label || 'partner payload'} must not include full phone`)
  }
  const banned = [
    'profile_snapshot_json',
    'raw_ai',
    'ab_test_fixture',
    'ab_test_run_id',
    'SECRET_PRIVATE_PREF',
    'SECRET_AI',
    'SECRET_OPENID',
    'SECRET_TEST'
  ]
  for (const token of banned) {
    if (text.includes(token)) {
      throw new Error(`${label || 'partner payload'} leaked ${token}`)
    }
  }
}

module.exports = {
  maskPhone,
  PARTNER_USER_DENY,
  sanitizePartnerUser,
  sanitizePartnerSelf,
  sanitizePartnerApplication,
  partnerApplicationNextAction,
  projectPartnerApplicationItem,
  assertNoSensitivePartnerPayload
}
