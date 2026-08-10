const assert = require('assert')

const { reviewMemberApplication } = require('../../miniprogram/cloudfunctions/api/handlers/member')
const { canSubmitApplication } = require('../../miniprogram/cloudfunctions/api/lib/memberPolicy')

function createScenario(status = 'pending_review') {
  const application = {
    _id: 'member_application_10',
    id: 10,
    user_id: 8,
    assigned_partner_id: 3,
    status
  }
  const user = { _id: 'user_8', id: 8, member_status: status }
  const writes = []
  const deps = {
    byId: async (name) => name === 'member_application' ? application : user,
    updateByDoc: async (name, doc, data) => {
      writes.push({ name, data })
      Object.assign(doc, data)
      return doc
    },
    addWithId: async (name, data) => {
      writes.push({ name, data })
      return { id: 1, ...data }
    },
    now: () => new Date('2026-07-11T00:00:00.000Z')
  }
  return { application, user, writes, deps }
}

async function main() {
  const approval = createScenario()

  await assert.rejects(() => reviewMemberApplication({
    applicationId: 10,
    action: 'approve',
    note: '资料真实'
  }, { role: 'partner', id: 4 }, approval.deps), /无权审核/)

  const result = await reviewMemberApplication({
    applicationId: 10,
    action: 'approve',
    note: '资料真实'
  }, { role: 'partner', id: 3 }, approval.deps)
  assert.strictEqual(result.member_status, 'approved')
  assert.strictEqual(approval.application.status, 'approved')
  assert.strictEqual(approval.writes[2].name, 'partner_user_audit_log')
  assert.strictEqual(approval.writes[2].data.actor_role, 'partner')

  const supplement = createScenario()
  await assert.rejects(() => reviewMemberApplication({
    applicationId: 10,
    action: 'need_more_info',
    note: ''
  }, { role: 'admin', id: 1 }, supplement.deps), /请填写审核意见/)
  await reviewMemberApplication({
    applicationId: 10,
    action: 'need_more_info',
    note: '请补充具体职业'
  }, { role: 'admin', id: 1 }, supplement.deps)
  assert.strictEqual(supplement.application.status, 'need_more_info')
  assert.strictEqual(supplement.user.member_status, 'need_more_info')
  assert.strictEqual(canSubmitApplication(supplement.user).allowed, true)

  const rejection = createScenario()
  await reviewMemberApplication({
    applicationId: 10,
    action: 'reject',
    note: '资料无法核验'
  }, { role: 'admin', id: 1 }, rejection.deps)
  assert.strictEqual(rejection.application.status, 'rejected')
  assert.strictEqual(rejection.user.member_status, 'rejected')
  const rejectedAt = rejection.user.member_status_updated_at.getTime()
  assert.deepStrictEqual(
    canSubmitApplication(rejection.user, rejectedAt + 29 * 86400000),
    { allowed: false, remainingDays: 1 }
  )
  assert.deepStrictEqual(
    canSubmitApplication(rejection.user, rejectedAt + 30 * 86400000),
    { allowed: true, remainingDays: 0 }
  )

  const lifecycle = createScenario('approved')
  await reviewMemberApplication({
    applicationId: 10,
    action: 'disable',
    note: '会员资格复核'
  }, { role: 'admin', id: 1 }, lifecycle.deps)
  assert.strictEqual(lifecycle.application.status, 'disabled')
  assert.strictEqual(lifecycle.user.member_status, 'disabled')
  await reviewMemberApplication({
    applicationId: 10,
    action: 'restore',
    note: '复核完成'
  }, { role: 'admin', id: 1 }, lifecycle.deps)
  assert.strictEqual(lifecycle.application.status, 'approved')
  assert.strictEqual(lifecycle.user.member_status, 'approved')

  await assert.rejects(() => reviewMemberApplication({
    applicationId: 10,
    action: 'approve',
    note: ''
  }, { role: 'admin', id: 1 }, lifecycle.deps), /当前状态不能执行/)

  console.log('PASS member review action lifecycle')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
