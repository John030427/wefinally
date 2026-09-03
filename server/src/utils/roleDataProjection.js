'use strict'

/**
 * Role-aware response projections for Express Admin APIs.
 * ROUTE_AUTHORIZATION ≠ RESPONSE_DATA_AUTHORIZATION — both must pass.
 */

const { maskPhone } = require('./privacyMask')
const { ADMIN_ROLES } = require('../config/constants')

function supportRef(userId, supportCode) {
  if (supportCode) return String(supportCode)
  const id = Number(userId || 0)
  if (!id) return ''
  return `WF-U-${String(id).padStart(6, '0')}`
}

function matchRef(matchId) {
  const id = Number(matchId || 0)
  if (!id) return ''
  return `WF-M-${String(id).padStart(6, '0')}`
}

function stripIdentitySecrets(payload) {
  const text = JSON.stringify(payload || {})
  return !/\b(openid|unionid|user_openid|match_user_openid|matched_openid)\b/i.test(text)
}

function handoffStatusText(status) {
  return {
    submitted: '已提交',
    processing: '客服处理中',
    waiting_partner: '等待对方确认',
    arranged: '已安排',
    closed: '已关闭',
  }[status] || '已提交'
}

/** Customer-service order DTO — no openid/phone/profile */
function formatOrderForService(row) {
  if (!row) return row
  return {
    id: row.id,
    order_no: row.order_no,
    user_id: row.user_id,
    user_ref: supportRef(row.user_id, row.support_code),
    amount: Number(row.price ?? row.amount ?? 0),
    status: row.pay_status ?? row.status,
    pay_status: row.pay_status ?? row.status,
    settled: row.settle_status === 1 || row.settled === true,
    paid_at: row.pay_time || row.paid_at || null,
    created_at: row.create_time || row.created_at || null,
  }
}

/** Finance order DTO — settlement fields only */
function formatOrderForFinance(row) {
  if (!row) return row
  return {
    id: row.id,
    order_no: row.order_no,
    user_id: row.user_id,
    user_ref: supportRef(row.user_id, row.support_code),
    amount: Number(row.price ?? row.amount ?? 0),
    payment_status: row.pay_status ?? row.status,
    pay_status: row.pay_status ?? row.status,
    settlement_status: row.settle_status ?? (row.settled ? 1 : 0),
    settled: row.settle_status === 1 || row.settled === true,
    partner_id: row.partner_id || null,
    partner_name: row.partner_name || null,
    partner_commission: Number(row.partner_commission ?? 0),
    created_at: row.create_time || row.created_at || null,
    paid_at: row.pay_time || row.paid_at || null,
  }
}

/** Super-admin may keep richer order fields but still avoid accidental openid in default unless opted in */
function formatOrderForAdmin(row, options) {
  if (!row) return row
  const opts = options || {}
  const base = {
    id: row.id,
    order_no: row.order_no,
    user_id: row.user_id,
    partner_id: row.partner_id,
    partner_name: row.partner_name || null,
    amount: Number(row.price ?? row.amount ?? 0),
    price: Number(row.price ?? row.amount ?? 0),
    status: row.pay_status ?? row.status,
    pay_status: row.pay_status ?? row.status,
    settle_status: row.settle_status,
    settled: row.settle_status === 1 || row.settled === true,
    partner_commission: Number(row.partner_commission ?? 0),
    paid_at: row.pay_time || row.paid_at || null,
    pay_time: row.pay_time || row.paid_at || null,
    created_at: row.create_time || row.created_at || null,
    create_time: row.create_time || row.created_at || null,
  }
  if (opts.includeOpenId && row.openid) base.openid = row.openid
  return base
}

function formatOrderByRole(row, role) {
  if (role === ADMIN_ROLES.CUSTOMER_SERVICE) return formatOrderForService(row)
  if (role === ADMIN_ROLES.FINANCE) return formatOrderForFinance(row)
  return formatOrderForAdmin(row, { includeOpenId: role === ADMIN_ROLES.SUPER_ADMIN })
}

function formatHandoffTicketForService(row) {
  if (!row) return row
  return {
    id: row.id,
    match_log_id: row.match_log_id,
    match_ref: matchRef(row.match_log_id),
    user_id: row.user_id,
    user_ref: supportRef(row.user_id, row.user_support_code),
    match_user_id: row.match_user_id,
    match_user_ref: supportRef(row.match_user_id, row.match_user_support_code),
    status: row.status,
    status_text: handoffStatusText(row.status),
    service_note: row.service_note || '',
    user_city: row.user_city || '',
    match_user_city: row.match_user_city || '',
    create_time: row.create_time,
    update_time: row.update_time,
  }
}

function formatHandoffTicketForAdmin(row) {
  // Super-admin debug may include openids when present; CS never uses this path.
  const base = formatHandoffTicketForService(row)
  if (row.user_openid) base.user_openid = row.user_openid
  if (row.match_user_openid) base.match_user_openid = row.match_user_openid
  return base
}

function formatHandoffTicket(row, role) {
  if (role === ADMIN_ROLES.SUPER_ADMIN) return formatHandoffTicketForAdmin(row)
  return formatHandoffTicketForService(row)
}

function formatMatchForService(row) {
  if (!row) return row
  const status = row.status || row.match_status || ''
  const displayStatus = status === 'no_match' || status === 'NO_MATCH'
    ? 'NO MATCH'
    : (status || (row.match_user_id ? 'matched' : 'unknown'))
  return {
    id: row.id,
    match_ref: matchRef(row.id),
    user_id: row.user_id,
    user_ref: supportRef(row.user_id, row.user_support_code),
    match_user_id: row.match_user_id || null,
    match_user_ref: row.match_user_id ? supportRef(row.match_user_id, row.matched_support_code) : null,
    batch_date: row.batch_date || row.match_date || null,
    match_type: row.match_type || null,
    display_status: displayStatus,
    status: status,
    city: row.city || row.user_city || null,
    coordination_state: row.coordination_status || row.coordination_state || null,
    create_time: row.create_time || row.created_at || null,
  }
}

function formatMatchForAdmin(row) {
  const base = formatMatchForService(row)
  if (row.user_openid) base.user_openid = row.user_openid
  if (row.matched_openid) base.matched_openid = row.matched_openid
  if (row.score != null) base.score = row.score
  return base
}

function formatMatchByRole(row, role) {
  if (role === ADMIN_ROLES.CUSTOMER_SERVICE) return formatMatchForService(row)
  return formatMatchForAdmin(row)
}

function formatWithdrawForFinance(row) {
  if (!row) return row
  return {
    id: row.id,
    partner_id: row.partner_id,
    partner_name: row.partner_name || row.partner_username || '',
    partner_phone_masked: maskPhone(row.partner_phone || row.phone || ''),
    amount: Number(row.amount || 0),
    status: row.status,
    remark: row.remark || '',
    created_at: row.create_time || row.created_at || null,
    create_time: row.create_time || row.created_at || null,
    update_time: row.update_time || null,
  }
}

function formatWithdrawByRole(row, role) {
  if (role === ADMIN_ROLES.FINANCE || role === ADMIN_ROLES.CUSTOMER_SERVICE) {
    return formatWithdrawForFinance(row)
  }
  // Admin: still mask phone by default
  const base = formatWithdrawForFinance(row)
  if (role === ADMIN_ROLES.SUPER_ADMIN && row.partner_phone) {
    base.partner_phone_masked = maskPhone(row.partner_phone)
  }
  return base
}

function formatUserDetailForAuditor(userRow, extras) {
  const extrasSafe = extras || {}
  const user = {
    id: userRow.id,
    support_code: userRow.support_code || null,
    user_ref: supportRef(userRow.id, userRow.support_code),
    gender: userRow.gender,
    birth_year: userRow.birth_year,
    city: userRow.city,
    education: userRow.education || null,
    occupation_description: userRow.occupation_description || '',
    status: userRow.status,
    member_status: userRow.member_status,
    marry_status: userRow.marry_status || null,
    is_vip: userRow.is_vip,
    vip_expire_time: userRow.vip_expire_time || userRow.vip_expire_at || null,
    promote_partner_id: userRow.promote_partner_id || null,
    partner_name: extrasSafe.partner_name || userRow.partner_name || null,
    phone_masked: maskPhone(userRow.phone || ''),
    create_time: userRow.create_time || userRow.created_at || null,
  }
  const agreements = extrasSafe.agreements_status || {
    user_service: Boolean(extrasSafe.latestAuth && extrasSafe.latestAuth.auth_service),
    privacy: Boolean(extrasSafe.latestAuth && extrasSafe.latestAuth.auth_privacy),
    data_auth: Boolean(extrasSafe.latestAuth && extrasSafe.latestAuth.auth_data),
  }
  return {
    user,
    application: extrasSafe.application || null,
    profile_completeness: extrasSafe.profile_completeness || null,
    partner_attribution: extrasSafe.partner_attribution || (user.promote_partner_id ? {
      partner_id: user.promote_partner_id,
      partner_name: user.partner_name,
    } : null),
    agreements_status: agreements,
  }
}

function formatChatSessionForService(row) {
  if (!row) return row
  const g = row.gender === 1 || row.gender === '1' ? '男' : row.gender === 2 || row.gender === '2' ? '女' : ''
  return {
    id: row.user_id || row.id,
    user_id: row.user_id,
    user_ref: supportRef(row.user_id, row.support_code),
    nickname: row.nickname || [row.city, g].filter(Boolean).join('·') || `用户${row.user_id}`,
    phone_masked: maskPhone(row.phone || ''),
    city: row.city || '',
    updated_at: row.last_time || row.updated_at,
    last_log_id: row.last_log_id,
  }
}

module.exports = {
  supportRef,
  matchRef,
  stripIdentitySecrets,
  handoffStatusText,
  formatOrderForService,
  formatOrderForFinance,
  formatOrderForAdmin,
  formatOrderByRole,
  formatHandoffTicketForService,
  formatHandoffTicketForAdmin,
  formatHandoffTicket,
  formatMatchForService,
  formatMatchForAdmin,
  formatMatchByRole,
  formatWithdrawForFinance,
  formatWithdrawByRole,
  formatUserDetailForAuditor,
  formatChatSessionForService,
}
