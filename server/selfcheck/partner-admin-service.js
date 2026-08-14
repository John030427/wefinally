const assert = require('assert')
const { createPartnerAdminService } = require('../../miniprogram/cloudfunctions/api/lib/partnerAdminService')

function fakeDeps() {
  const tables = {
    partner_candidate: [],
    partner: [{ _id: 'partner_5', id: 5, name: '存量合伙人', status: 1, user_id: 7, partner_code: 'WF-P-0005', promote_code: 'OLD5', binding_version: 1, balance: 20, password: 'must-not-leak', phone: '13800000005' }],
    partner_audit_log: []
  }
  let nextId = 20
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    tables,
    now: () => new Date('2026-08-14T11:00:00.000Z'),
    async list(name, query, limit) {
      return (tables[name] || []).filter((row) => matches(row, query || {})).slice(0, limit || 100)
    },
    async first(name, query) {
      return (tables[name] || []).find((row) => matches(row, query || {})) || null
    },
    async byId(name, id) {
      return (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null
    },
    async addWithId(name, data) {
      const row = { _id: `${name}_${++nextId}`, id: nextId, ...data }
      tables[name].push(row)
      return row
    },
    async updateByDoc(name, row, data) {
      Object.assign(row, data)
      return row
    }
  }
}

async function main() {
  const deps = fakeDeps()
  const service = createPartnerAdminService(deps, { phoneSecret: 'partner-admin-phone-lookup-secret-for-selfcheck' })
  const superAdmin = { role: 'admin', admin_role: 'super_admin', id: 1 }
  const customerService = { role: 'admin', admin_role: 'customer_service', id: 2 }
  const auditor = { role: 'admin', admin_role: 'auditor', id: 3 }

  const created = await service.createRosterCandidate(superAdmin, {
    phone: '+86 138 0000 1234',
    name: '名单合伙人',
    note: '老板确认',
    request_id: 'roster-create-1'
  })
  assert.strictEqual(created.phone_masked, '138****1234')
  assert.strictEqual(created.review_status, 'approved')
  assert.strictEqual(created.activation_status, 'unbound')
  assert.strictEqual(created.phone_digest, undefined)
  assert.strictEqual(deps.tables.partner_candidate[0].phone, undefined)
  assert.ok(deps.tables.partner_candidate[0].phone_digest)
  assert.strictEqual(deps.tables.partner_audit_log[0].action, 'roster_create')
  assert.strictEqual(deps.tables.partner_audit_log[0].phone_digest, undefined)
  const createdAgain = await service.createRosterCandidate(superAdmin, {
    phone: '+86 138 0000 1234',
    name: '名单合伙人',
    note: '老板确认',
    request_id: 'roster-create-1'
  })
  assert.strictEqual(createdAgain.id, created.id)
  assert.strictEqual(deps.tables.partner_audit_log.length, 1)

  await assert.rejects(() => service.createRosterCandidate(customerService, { phone: '13900005678', name: '无权' }), /无权/)
  await assert.rejects(() => service.createRosterCandidate(superAdmin, { phone: '13800001234', name: '重复' }), /手机号已在合伙人名单/)

  const list = await service.listCandidates(customerService, {})
  assert.strictEqual(list.length, 1)
  assert.strictEqual(list[0].phone_digest, undefined)
  assert.strictEqual(list[0].phone, undefined)
  assert.strictEqual((await service.listCandidates(auditor, {})).length, 1)

  const detail = await service.candidateDetail(auditor, created.id)
  assert.strictEqual(detail.candidate.id, created.id)
  assert.strictEqual(detail.audits.length, 1)
  assert.strictEqual(detail.audits[0].phone_digest, undefined)

  const pending = await deps.addWithId('partner_candidate', {
    source: 'application',
    phone_digest: 'application-digest',
    phone_masked: '139****5678',
    applicant_user_id: 8,
    review_status: 'pending',
    activation_status: 'unbound'
  })
  const approved = await service.reviewCandidate(superAdmin, pending.id, {
    action: 'approve',
    reason: '资料符合要求',
    request_id: 'review-approve-1'
  })
  assert.strictEqual(approved.review_status, 'approved')
  assert.strictEqual(deps.tables.partner_audit_log.at(-1).action, 'approve')
  const approvedAgain = await service.reviewCandidate(superAdmin, pending.id, {
    action: 'approve',
    reason: '资料符合要求',
    request_id: 'review-approve-1'
  })
  assert.strictEqual(approvedAgain.id, approved.id)

  const partnerList = await service.listPartners(customerService, {})
  assert.strictEqual(partnerList[0].phone, undefined)
  assert.strictEqual(partnerList[0].password, undefined)
  assert.strictEqual(partnerList[0].phone_masked, '')

  const suspended = await service.changePartner(superAdmin, 5, { action: 'suspend', reason: '暂时停用', request_id: 'partner-suspend-1' })
  assert.strictEqual(suspended.status, 2)
  const resumed = await service.changePartner(superAdmin, 5, { action: 'resume', reason: '恢复合作', request_id: 'partner-resume-1' })
  assert.strictEqual(resumed.status, 1)
  const unbound = await service.changePartner(superAdmin, 5, { action: 'unbind', reason: '更换微信', request_id: 'partner-unbind-1' })
  assert.strictEqual(unbound.status, 0)
  assert.strictEqual(unbound.user_id, 0)
  assert.strictEqual(unbound.binding_version, 2)
  assert.strictEqual(unbound.phone, undefined)
  assert.strictEqual(unbound.password, undefined)
  const unboundAgain = await service.changePartner(superAdmin, 5, { action: 'unbind', reason: '更换微信', request_id: 'partner-unbind-1' })
  assert.strictEqual(unboundAgain.binding_version, 2)

  await assert.rejects(() => service.changePartner(superAdmin, 5, { action: 'resume', reason: '', request_id: 'missing-reason' }), /原因/)

  const imported = await service.importRoster(superAdmin, {
    rows: [
      { phone: '13900005678', name: '批量一' },
      { phone: 'bad', name: '批量坏数据' }
    ],
    request_id: 'roster-import-1'
  })
  assert.strictEqual(imported.created, 1)
  assert.strictEqual(imported.failed, 1)
  assert.strictEqual(imported.results.length, 2)

  console.log('PASS partner admin roster, review and lifecycle service')
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exitCode = 1
})
