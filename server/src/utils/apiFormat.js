/** 管理后台 / 合伙人后台 API 字段别名（兼容 SPA 前端） */

const {
  sanitizePartnerUser,
  sanitizePartnerSelf,
  maskPhone
} = require('./privacyMask')

function genderLabel(g) {
  if (g === 1 || g === '1') return '男'
  if (g === 2 || g === '2') return '女'
  return ''
}

function formatUserForAdmin(row, options) {
  if (!row) return row
  const opts = options || {}
  const g = genderLabel(row.gender)
  const nickname = row.nickname || [row.city, g, row.birth_year ? `${row.birth_year}年` : ''].filter(Boolean).join('·') || `用户${row.id}`
  const base = {
    id: row.id,
    support_code: row.support_code || null,
    nickname,
    gender: row.gender,
    birth_year: row.birth_year,
    city: row.city,
    status: row.status,
    member_status: row.member_status,
    marry_status: row.marry_status,
    is_vip: row.is_vip,
    vip_expire_at: row.vip_expire_time || row.vip_expire_at || null,
    vip_expire_time: row.vip_expire_time || row.vip_expire_at || null,
    is_divorced: row.marry_status === '离异' ? 1 : 0,
    created_at: row.create_time || row.created_at,
    create_time: row.create_time || row.created_at,
    partner_name: row.partner_name,
    promote_partner_id: row.promote_partner_id,
    promote_code: row.promote_code,
    phone_masked: maskPhone(row.phone || ''),
    display_label: row.display_label || (row.support_code ? row.support_code : nickname)
  }
  // OpenID only for explicit super_admin debug projection
  if (opts.includeOpenId) {
    base.openid = row.openid
    base.phone = row.phone || null
  } else {
    base.phone = base.phone_masked || '-'
  }
  return base
}

function formatPartnerForAdmin(row) {
  if (!row) return row
  return sanitizePartnerSelf(row)
}

function formatOrderForAdmin(row) {
  if (!row) return row
  const { formatOrderForAdmin: project } = require('./roleDataProjection')
  return project(row, { includeOpenId: false })
}

function formatWithdrawForAdmin(row) {
  if (!row) return row
  const { formatWithdrawByRole } = require('./roleDataProjection')
  const { ADMIN_ROLES } = require('../config/constants')
  return formatWithdrawByRole(row, ADMIN_ROLES.SUPER_ADMIN)
}

function formatPartnerUser(row) {
  return sanitizePartnerUser(row)
}

function formatPartnerOrder(row) {
  if (!row) return row
  return {
    id: row.id,
    order_no: row.order_no,
    amount: Number(row.price ?? row.amount ?? 0),
    partner_commission: Number(row.partner_commission ?? 0),
    status: row.pay_status ?? row.status,
    settled: row.settle_status === 1 || row.settled === true,
    paid_at: row.pay_time || row.paid_at || null,
    created_at: row.create_time || row.created_at,
  }
}

function formatChatSession(row) {
  if (!row) return row
  const g = genderLabel(row.gender)
  return {
    id: row.user_id || row.id,
    user_id: row.user_id,
    nickname: row.nickname || [row.city, g].filter(Boolean).join('·') || `用户${row.user_id}`,
    phone_masked: maskPhone(row.phone || ''),
    phone: maskPhone(row.phone || '') || '-',
    updated_at: row.last_time || row.updated_at,
    last_log_id: row.last_log_id,
  }
}

function privacyAuthToAgreements(log) {
  if (!log) return []
  const list = []
  if (log.auth_service) list.push({ agreement_type: 'user_service' })
  if (log.auth_privacy) list.push({ agreement_type: 'privacy' })
  if (log.auth_data) list.push({ agreement_type: 'data_auth' })
  return list
}

module.exports = {
  formatUserForAdmin,
  formatPartnerForAdmin,
  formatOrderForAdmin,
  formatWithdrawForAdmin,
  formatPartnerUser,
  formatPartnerOrder,
  formatChatSession,
  privacyAuthToAgreements,
  maskPhone,
}
