const assert = require('assert')

const {
  changeInternalTestVip
} = require('../../miniprogram/cloudfunctions/api/handlers/internalTestVip')

function scenario(overrides = {}) {
  const user = Object.assign({
    _id: 'user_8',
    id: 8,
    member_status: 'approved',
    status: 1,
    is_vip: 0,
    vip_expire_time: null,
    vip_source: '',
    promote_partner_id: 3
  }, overrides.user || {})
  const writes = []
  const audits = []
  const now = new Date('2026-07-24T08:00:00.000Z')
  return {
    user,
    writes,
    audits,
    deps: {
      byId: async (name, id) => name === 'user' && Number(id) === user.id ? user : null,
      first: async (name, query) => {
        if (name !== 'partner_user_audit_log') return null
        return audits.find((row) => row.request_id === query.request_id) || null
      },
      updateByDoc: async (name, doc, data) => {
        writes.push({ name, data })
        Object.assign(doc, data)
        return doc
      },
      addWithId: async (name, data) => {
        const row = { _id: `audit_${audits.length + 1}`, id: audits.length + 1, ...data }
        writes.push({ name, data })
        audits.push(row)
        return row
      },
      now: () => now
    }
  }
}

async function main() {
  const baseInput = {
    userId: 8,
    action: 'grant',
    days: 7,
    reason: 'A/B 内测匹配验证',
    requestId: 'test_vip_8_1784880000000'
  }

  await assert.rejects(
    () => changeInternalTestVip(baseInput, { role: 'partner', id: 3 }, scenario().deps),
    /仅超级管理员/
  )
  await assert.rejects(
    () => changeInternalTestVip(baseInput, { role: 'admin', id: 1, admin_role: 'auditor' }, scenario().deps),
    /仅超级管理员/
  )
  await assert.rejects(
    () => changeInternalTestVip({ ...baseInput, reason: '' }, { role: 'admin', id: 1, admin_role: 'super_admin' }, scenario().deps),
    /填写授权原因/
  )
  await assert.rejects(
    () => changeInternalTestVip({ ...baseInput, days: 30 }, { role: 'admin', id: 1, admin_role: 'super_admin' }, scenario().deps),
    /1至14天/
  )

  const pending = scenario({ user: { member_status: 'pending_review' } })
  await assert.rejects(
    () => changeInternalTestVip(baseInput, { role: 'admin', id: 1, admin_role: 'super_admin' }, pending.deps),
    /审核通过/
  )

  const paid = scenario({
    user: {
      is_vip: 1,
      vip_source: 'wechat_pay',
      vip_expire_time: new Date('2026-08-24T08:00:00.000Z')
    }
  })
  await assert.rejects(
    () => changeInternalTestVip(baseInput, { role: 'admin', id: 1, admin_role: 'super_admin' }, paid.deps),
    /正式会员权益/
  )

  const granted = scenario()
  const result = await changeInternalTestVip(
    baseInput,
    { role: 'admin', id: 1, admin_role: 'super_admin' },
    granted.deps
  )
  assert.strictEqual(result.is_vip, 1)
  assert.strictEqual(result.vip_source, 'internal_test')
  assert.strictEqual(result.vip_expire_time.toISOString(), '2026-07-31T08:00:00.000Z')
  assert.strictEqual(granted.audits.length, 1)
  assert.strictEqual(granted.audits[0].action, 'grant_test_vip')
  assert.strictEqual(granted.audits[0].actor_role, 'admin')
  assert.strictEqual(granted.audits[0].reason, baseInput.reason)

  const repeated = await changeInternalTestVip(
    baseInput,
    { role: 'admin', id: 1, admin_role: 'super_admin' },
    granted.deps
  )
  assert.strictEqual(repeated.idempotent, 1)
  assert.strictEqual(granted.audits.length, 1)

  const revokeInput = {
    userId: 8,
    action: 'revoke',
    reason: 'A/B 内测结束',
    requestId: 'test_vip_revoke_8_1784881000000'
  }
  const revoked = await changeInternalTestVip(
    revokeInput,
    { role: 'admin', id: 1, admin_role: 'super_admin' },
    granted.deps
  )
  assert.strictEqual(revoked.is_vip, 0)
  assert.strictEqual(revoked.vip_expire_time, null)
  assert.strictEqual(revoked.vip_source, '')
  assert.strictEqual(granted.audits[1].action, 'revoke_test_vip')

  const paidRevoke = scenario({
    user: {
      is_vip: 1,
      vip_source: 'wechat_pay',
      vip_expire_time: new Date('2026-08-24T08:00:00.000Z')
    }
  })
  await assert.rejects(
    () => changeInternalTestVip(revokeInput, { role: 'admin', id: 1, admin_role: 'super_admin' }, paidRevoke.deps),
    /只能撤销内测/
  )

  console.log('PASS internal test VIP authorization policy')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
