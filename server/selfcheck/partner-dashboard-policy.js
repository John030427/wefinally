const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { buildPartnerDashboard } = require('../../miniprogram/cloudfunctions/api/lib/partnerDashboardPolicy')

const snapshot = buildPartnerDashboard({
  partner: { id: 7, name: '合伙人', promote_code: 'WF7', balance: 18.5 },
  users: [
    { id: 1, promote_partner_id: 7, member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01' },
    { id: 2, promote_partner_id: 7, member_status: 'pending_review', is_vip: 0 },
    { id: 3, promote_partner_id: 7, member_status: 'pending_profile', is_vip: 0 }
  ],
  orders: [
    { id: 10, partner_id: 7, pay_status: 1, partner_commission: 20, order_no: 'order-10' },
    { id: 11, partner_id: 7, pay_status: 1, partner_commission: 5, order_no: 'order-11' },
    { id: 12, partner_id: 7, pay_status: 0, partner_commission: 99, order_no: 'order-12' }
  ],
  withdrawals: [{ partner_id: 7, amount: 6, status: 0 }, { partner_id: 7, amount: 4, status: 1 }],
  attributions: [{ partner_id: 7, user_id: 1 }, { partner_id: 7, user_id: 1 }, { partner_id: 7, user_id: 2 }],
  rule: { rule_type: 'fixed', version: 'v2', effective_date: '2026-08-01', commission_condition: '支付成功', settlement_cycle: 'T+7' },
  daily: [{ date: '2026-08-10', registered: 2, paid: 1, commission: 20 }]
})

assert.strictEqual(snapshot.partner.id, 7)
assert.strictEqual(snapshot.metrics.attributed_registrations, 2)
assert.strictEqual(snapshot.metrics.profile_completed, 2)
assert.strictEqual(snapshot.metrics.approved_members, 1)
assert.strictEqual(snapshot.metrics.paid_members, 1)
assert.strictEqual(snapshot.metrics.paid_orders, 2)
assert.strictEqual(snapshot.metrics.total_commission, 25)
assert.strictEqual(snapshot.metrics.pending_amount, 6)
assert.strictEqual(snapshot.metrics.settled_amount, 4)
assert.strictEqual(snapshot.metrics.available_amount, 18.5)
assert.strictEqual(snapshot.metrics.registration_conversion_rate, 67)
assert.strictEqual(snapshot.metrics.paid_conversion_rate, 50)
assert.strictEqual(snapshot.rule.version, 'v2')
assert.strictEqual(snapshot.trends.days_7.length, 7)
assert.strictEqual(snapshot.trends.days_30.length, 30)
assert.strictEqual(snapshot.trends.days_7.find((row) => row.date === '2026-08-10').registered, 2)

const handler = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/backoffice.js'), 'utf8')
assert(handler.includes("/api\\/partner\\/dashboard$"))
assert(handler.includes('buildPartnerDashboard'))
assert(handler.includes('partner_referral_attribution'))

console.log('PASS partner dashboard policy deduplicates attribution and exposes server metrics')
