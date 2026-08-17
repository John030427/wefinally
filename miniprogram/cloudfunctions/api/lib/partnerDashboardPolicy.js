const DEFAULT_RULE = {
  rule_type: 'fixed',
  version: 'unconfigured',
  effective_date: null,
  commission_condition: '仅服务端验证支付成功后计入',
  refund_adjustment: '退款写反向台账，不改历史记录',
  settlement_cycle: '以平台结算规则为准'
}

function partnerDisplayName(partner = {}) {
  return '合伙人'
}

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function dayKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function uniqueUserIds(rows, partnerId) {
  const ids = new Set()
  ;(rows || []).forEach((row) => {
    if (Number(row.partner_id || row.promote_partner_id) !== Number(partnerId)) return
    const id = Number(row.user_id || row.id || 0)
    if (id > 0) ids.add(id)
  })
  return ids
}

function trendRows(daily, days, anchor) {
  const byDate = new Map()
  ;(daily || []).forEach((row) => {
    const date = dayKey(row.date || row.day || row.created_at)
    if (date) byDate.set(date, row)
  })
  const rows = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(anchor, -offset)
    const row = byDate.get(date) || {}
    rows.push({
      date,
      registered: number(row.registered || row.registrations || 0),
      paid: number(row.paid || row.paid_members || row.paid_orders || 0),
      commission: Math.round(number(row.commission || row.total_commission || 0) * 100) / 100
    })
  }
  return rows
}

function ledgerNet(entries, partnerId) {
  const seen = new Set()
  return (entries || []).reduce((sum, row) => {
    if (Number(row.partner_id) !== Number(partnerId)) return sum
    const key = String(row.idempotency_key || row._id || `${row.order_no}:${row.direction}:${row.amount}`)
    if (seen.has(key)) return sum
    seen.add(key)
    const amount = number(row.amount)
    return sum + (String(row.direction || '').toLowerCase() === 'debit' ? -amount : amount)
  }, 0)
}

function buildPartnerDashboard(input = {}) {
  const partner = input.partner || {}
  const partnerId = Number(partner.id || 0)
  const users = (input.users || []).filter((row) => Number(row.promote_partner_id || row.partner_id) === partnerId)
  const attributions = uniqueUserIds(input.attributions, partnerId)
  const registeredIds = attributions.size ? attributions : new Set(users.map((row) => Number(row.id)).filter((id) => id > 0))
  const approved = users.filter((row) => String(row.member_status || '') === 'approved').length
  const profileCompleted = users.filter((row) => String(row.member_status || '') !== 'pending_profile').length
  const paidOrders = (input.orders || []).filter((row) => Number(row.partner_id) === partnerId && Number(row.pay_status || row.status) === 1)
  const paidUserIds = new Set(paidOrders.map((row) => Number(row.user_id || 0)).filter((id) => id > 0))
  const paidMembers = paidUserIds.size || Math.min(approved, paidOrders.length)
  const ledgerRows = (input.ledger || []).filter((row) => Number(row.partner_id) === partnerId)
  const totalCommission = ledgerRows.length
    ? ledgerNet(ledgerRows, partnerId)
    : paidOrders.reduce((sum, row) => sum + number(row.partner_commission), 0)
  const withdrawals = (input.withdrawals || []).filter((row) => Number(row.partner_id) === partnerId)
  const pendingAmount = withdrawals.filter((row) => Number(row.status) === 0).reduce((sum, row) => sum + number(row.amount), 0)
  const settledAmount = withdrawals.filter((row) => Number(row.status) === 1 || Number(row.status) === 3).reduce((sum, row) => sum + number(row.amount), 0)
  const daily = input.daily || []
  const dates = daily.map((row) => dayKey(row.date || row.day || row.created_at)).filter(Boolean).sort()
  const anchor = dates[dates.length - 1] || dayKey(input.asOf || new Date())
  return {
    partner: {
      id: partnerId,
      name: partner.name || '',
      display_name: partnerDisplayName(partner),
      partner_code: partner.partner_code || '',
      promote_code: partner.promote_code || '',
      phone_masked: partner.phone_masked || '',
      status: Number(partner.status || 0),
      balance: Math.round(number(partner.balance) * 100) / 100
    },
    rule: Object.assign({}, DEFAULT_RULE, input.rule || {}),
    metrics: {
      attributed_registrations: registeredIds.size,
      share_triggers: (input.shareEvents || []).filter((row) => Number(row.partner_id) === partnerId).length,
      profile_completed: profileCompleted,
      approved_members: approved,
      paid_members: paidMembers,
      paid_orders: paidOrders.length,
      total_commission: Math.round(totalCommission * 100) / 100,
      pending_amount: Math.round(pendingAmount * 100) / 100,
      settled_amount: Math.round(settledAmount * 100) / 100,
      available_amount: Math.round(number(partner.balance) * 100) / 100,
      registration_conversion_rate: percent(registeredIds.size, users.length),
      paid_conversion_rate: percent(paidMembers, registeredIds.size)
    },
    trends: {
      days_7: trendRows(daily, 7, anchor),
      days_30: trendRows(daily, 30, anchor)
    }
  }
}

module.exports = { buildPartnerDashboard, partnerDisplayName }
