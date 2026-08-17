const assert = require('assert')
const {
  createUserBackofficeService,
  dispatchUserBackofficeRoute
} = require('../../miniprogram/cloudfunctions/api/agent/userBackofficeService')

function fakeDeps() {
  const tables = {
    user: [
      { _id: 'user_7', id: 7, support_code: 'WF-000007', openid: 'official-7', phone: '13800000007', gender: 2, city: '深圳', status: 1, is_vip: 1, vip_source: 'paid', promote_partner_id: 3 },
      { _id: 'user_8', id: 8, support_code: 'WF-000008', openid: 'official-8', gender: 1, city: '汕头', status: 1, is_vip: 0 },
      { _id: 'users_118', id: 118, openid: 'dev_wefinally_local_openid', gender: 1, city: '深圳', status: 1 }
    ],
    user_match_setting: [{ id: 20, user_id: 7, age_min: 27, age_max: 38, self_view_text: '重视沟通', target_view_text: '真诚稳定' }],
    user_match_log: [
      { id: 30, user_id: 7, match_user_id: 8, total_score: 88, score_detail_json: '{"total":88}', prompt_debug_payload: 'must-not-leak', match_date: '2026-08-12' },
      { id: 31, user_id: 7, match_user_id: 118, total_score: 66, score_detail_json: '{"total":66}', match_type: '开发测试', match_date: '2026-08-13' }
    ],
    user_order: [{ id: 40, user_id: 7, order_no: 'ORDER-SENSITIVE-7', price: 188, pay_status: 1, settle_status: 0, partner_id: 3 }],
    member_application: [{ id: 50, user_id: 7, assigned_partner_id: 3, status: 'approved', profile_snapshot_json: '{"private":"snapshot"}' }],
    partner: [{ id: 3, name: 'Grace 合伙人', promote_code: 'GRACE', status: 1 }],
    partner_referral_attribution: [{ id: 60, user_id: 7, partner_id: 3, promote_code: 'GRACE', referral_token_hash: 'must-not-leak' }],
    agent_session: [
      { id: 70, user_id: 7, agent_type: 'date_coordinator', status: 'active' },
      { id: 71, user_id: 7, agent_type: 'platform_service', status: 'manual_pending' }
    ],
    agent_human_ticket: [{ id: 80, session_id: 71, user_id: 7, status: 'open', summary: '订单问题' }],
    date_coordination: [{ id: 90, user_a_id: 7, user_b_id: 8, status: 'arranged' }],
    agent_notification_job: [{ id: 100, user_id: 7, coordination_id: 90, stage: 'proposal_generated', status: 'sent' }],
    partner_user_audit_log: []
  }
  let auditId = 200
  let nextSupport = 9
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    tables,
    now: () => new Date('2026-08-13T08:00:00.000Z'),
    async list(name, query, limit) {
      return (tables[name] || []).filter((row) => matches(row, query)).slice(0, limit || 100)
    },
    async first(name, query) {
      return (tables[name] || []).find((row) => matches(row, query)) || null
    },
    async byId(name, value) {
      return (tables[name] || []).find((row) => Number(row.id) === Number(value)) || null
    },
    async updateByDoc(name, doc, data) {
      Object.assign(doc, data, { update_time: this.now() })
      return doc
    },
    async addWithId(name, data) {
      const row = { id: ++auditId, ...data, create_time: this.now(), update_time: this.now() }
      tables[name].push(row)
      return row
    },
    async ensureUserSupportCode(user) {
      if (user.support_code) return user.support_code
      user.support_code = `WF-${String(nextSupport++).padStart(6, '0')}`
      return user.support_code
    }
  }
}

async function main() {
  const deps = fakeDeps()
  const service = createUserBackofficeService(deps)
  const customerService = { role: 'admin', admin_role: 'customer_service', id: 2 }
  const auditor = { role: 'admin', admin_role: 'auditor', id: 3 }
  const superAdmin = { role: 'admin', admin_role: 'super_admin', id: 1 }

  const users = await service.listUsers(customerService, {})
  assert.strictEqual(users.total, 2)
  assert.deepStrictEqual(users.list.map((row) => row.support_code), ['WF-000008', 'WF-000007'])
  assert.strictEqual(users.list.some((row) => row.is_test), false)
  assert.strictEqual(users.list[0].openid, undefined)

  const withTests = await service.listUsers(superAdmin, { include_test: true })
  assert.strictEqual(withTests.total, 3)
  assert.strictEqual(withTests.list[0].support_code, 'TEST-000118')
  assert.strictEqual(withTests.list[0].is_test, true)

  const searched = await service.listUsers(customerService, { keyword: 'WF-000007' })
  assert.deepStrictEqual(searched.list.map((row) => row.support_code), ['WF-000007'])

  const detail = await service.userDetail(customerService, 7)
  assert.strictEqual(detail.user.support_code, 'WF-000007')
  assert.strictEqual(detail.user.openid, undefined)
  assert.strictEqual(detail.user.phone, undefined)
  assert.strictEqual(detail.member_application.status, 'approved')
  assert.strictEqual(detail.partner.name, 'Grace 合伙人')
  assert.strictEqual(detail.orders.length, 1)
  assert.strictEqual(detail.orders[0].order_no, undefined)
  assert.strictEqual(detail.matches.length, 1)
  assert.deepStrictEqual(detail.matches.map((row) => row.id), [30])
  assert.strictEqual(detail.conversations.length, 2)
  assert.strictEqual(detail.tickets.length, 1)
  assert.strictEqual(detail.coordinations.length, 1)
  assert.strictEqual(detail.notification_jobs.length, 1)
  assert.strictEqual(detail.matches[0].prompt_debug_payload, undefined)
  assert.strictEqual(detail.member_application.profile_snapshot_json, undefined)
  assert.strictEqual(detail.attribution.referral_token_hash, undefined)
  assert.strictEqual(deps.tables.partner_user_audit_log.at(-1).action, 'view_user_aggregate')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(deps.tables.partner_user_audit_log.at(-1), 'openid'), false)

  const adminDetail = await service.userDetail(superAdmin, 7)
  assert.strictEqual(adminDetail.user.openid, 'official-7')
  assert.strictEqual(adminDetail.user.phone, '13800000007')
  assert.strictEqual(adminDetail.orders[0].order_no, 'ORDER-SENSITIVE-7')

  const testDetail = await service.userDetail(superAdmin, 118)
  assert.deepStrictEqual(testDetail.matches.map((row) => row.id), [31])

  const dashboard = await service.dashboard(superAdmin)
  assert.deepStrictEqual(dashboard, {
    users: 2,
    vip_users: 1,
    partners: 1,
    paid_orders: 1,
    revenue: 188,
    pending_member_applications: 0,
    open_service_tickets: 1
  })

  const orders = await service.listOrders(customerService, {})
  assert.strictEqual(orders.list[0].user.support_code, 'WF-000007')
  assert.strictEqual(orders.list[0].order_no, undefined)
  const matches = await service.listMatches(customerService, {})
  assert.strictEqual(matches.list[0].owner.support_code, 'WF-000007')
  assert.strictEqual(matches.list[0].matched.support_code, 'WF-000008')
  const matchDetail = await service.matchDetail(superAdmin, 30)
  assert.strictEqual(matchDetail.score_detail.total, 88)
  assert.strictEqual(matchDetail.owner.match_settings.self_view_text, '重视沟通')

  await assert.rejects(() => service.updateUser(customerService, 7, { status: 2 }), /无权/)
  await assert.rejects(() => service.updateUser(auditor, 7, { status: 2 }), /无权/)
  const updated = await service.updateUser(superAdmin, 7, { status: 2, is_vip: 0 })
  assert.strictEqual(updated.status, 2)
  assert.strictEqual(updated.is_vip, 0)
  assert.strictEqual(deps.tables.partner_user_audit_log.at(-1).action, 'update_user')

  deps.tables.user.push({ _id: 'user_9', id: 9, openid: 'official-9', gender: 2, city: '广州', status: 1 })
  const dryRun = await service.backfillSupportCodes(superAdmin, { dry_run: true })
  assert.deepStrictEqual(dryRun.user_ids, [9])
  assert.strictEqual(deps.tables.user.at(-1).support_code, undefined)
  await assert.rejects(
    () => service.backfillSupportCodes(superAdmin, { confirm: true, user_ids: [8, 9] }),
    /回填名单与预览不一致/
  )
  const backfilled = await service.backfillSupportCodes(superAdmin, { confirm: true, user_ids: [9] })
  assert.deepStrictEqual(backfilled.updated, [{ user_id: 9, support_code: 'WF-000009' }])
  await assert.rejects(() => service.backfillSupportCodes(customerService, { dry_run: true }), /无权/)

  await assert.rejects(() => service.userDetail(superAdmin, 999), /用户不存在/)

  const routedUsers = await dispatchUserBackofficeRoute({
    method: 'GET', path: '/api/admin/users', query: { include_test: '1' }, body: {}, actor: superAdmin, service
  })
  assert.strictEqual(routedUsers.handled, true)
  assert.strictEqual(routedUsers.data.total, 4)
  const routedDetail = await dispatchUserBackofficeRoute({
    method: 'GET', path: '/api/admin/users/7', query: {}, body: {}, actor: customerService, service
  })
  assert.strictEqual(routedDetail.data.user.support_code, 'WF-000007')
  const routedBackfill = await dispatchUserBackofficeRoute({
    method: 'POST', path: '/api/admin/users/support-codes/backfill', query: {}, body: { dry_run: true }, actor: superAdmin, service
  })
  assert.strictEqual(routedBackfill.handled, true)
  const unhandled = await dispatchUserBackofficeRoute({
    method: 'GET', path: '/api/admin/not-this-route', query: {}, body: {}, actor: superAdmin, service
  })
  assert.strictEqual(unhandled.handled, false)

  console.log('PASS CloudBase admin user business service')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
