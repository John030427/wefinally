const assert = require('assert')

const { reviewMemberApplication } = require('../../miniprogram/cloudfunctions/api/handlers/member')

async function main() {
  const application = {
    _id: 'member_application_10',
    id: 10,
    user_id: 8,
    assigned_partner_id: 3,
    status: 'pending_review'
  }
  const user = { _id: 'user_8', id: 8, member_status: 'pending_review' }
  const writes = []
  const deps = {
    byId: async (name) => name === 'member_application' ? application : user,
    updateByDoc: async (name, doc, data) => {
      writes.push({ name, data })
      return { ...doc, ...data }
    },
    addWithId: async (name, data) => {
      writes.push({ name, data })
      return { id: 1, ...data }
    },
    now: () => new Date('2026-07-11T00:00:00.000Z')
  }

  await assert.rejects(() => reviewMemberApplication({
    applicationId: 10,
    action: 'approve',
    note: '资料真实'
  }, { role: 'partner', id: 4 }, deps), /无权审核/)

  const result = await reviewMemberApplication({
    applicationId: 10,
    action: 'approve',
    note: '资料真实'
  }, { role: 'partner', id: 3 }, deps)
  assert.strictEqual(result.member_status, 'approved')
  assert.strictEqual(writes[0].data.status, 'approved')
  assert.strictEqual(writes[1].data.member_status, 'approved')
  assert.strictEqual(writes[2].name, 'partner_user_audit_log')
  assert.strictEqual(writes[2].data.actor_role, 'partner')

  console.log('PASS member review action')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
