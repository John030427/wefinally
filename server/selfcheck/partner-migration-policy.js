const assert = require('assert')
const {
  planPartnerMigration,
  planPartnerSupportCounter,
  applyPartnerMigration
} = require('../../miniprogram/cloudfunctions/api/lib/partnerMigrationPolicy')

async function main() {
  const legacy = { _id: 'partner_1', id: 1, name: '内测合伙人', promote_code: 'WFINNER', status: 1, balance: 0, password: 'legacy-hash' }
  const plan = planPartnerMigration([legacy])
  assert.deepStrictEqual(plan.map((item) => item.patch), [{ partner_code: 'WF-P-0001', binding_version: 1 }])
  assert.strictEqual(plan[0].preserved.promote_code, 'WFINNER')
  assert.strictEqual(plan[0].preserved.password, true)
  assert.strictEqual(plan[0].patch.promote_code, undefined)
  assert.strictEqual(plan[0].patch.password, undefined)

  assert.deepStrictEqual(planPartnerSupportCounter([legacy], null), {
    counter_id: 'partner_support_code',
    seq: 1
  })
  assert.deepStrictEqual(planPartnerSupportCounter([
    { _id: 'partner_2', id: 2, partner_code: 'WF-P-0012' },
    { _id: 'partner_3', id: 20, partner_code: 'legacy-code' }
  ], { seq: 18 }), {
    counter_id: 'partner_support_code',
    seq: 20
  })
  assert.strictEqual(planPartnerSupportCounter([legacy], { seq: 8 }), null)

  const writes = []
  const counterWrites = []
  await assert.rejects(() => applyPartnerMigration(plan, { confirm: '', update: async () => {} }), /确认/)
  const result = await applyPartnerMigration(plan, {
    confirm: 'CONFIRM_PARTNER_MIGRATION',
    update: async (documentId, patch) => writes.push({ documentId, patch }),
    counterPlan: planPartnerSupportCounter([legacy], null),
    upsertCounter: async (counterId, seq) => counterWrites.push({ counterId, seq })
  })
  assert.strictEqual(result.updated, 1)
  assert.strictEqual(result.counter_updated, true)
  assert.deepStrictEqual(writes, [{ documentId: 'partner_1', patch: { partner_code: 'WF-P-0001', binding_version: 1 } }])
  assert.deepStrictEqual(counterWrites, [{ counterId: 'partner_support_code', seq: 1 }])
  assert.deepStrictEqual(planPartnerMigration([{ ...legacy, ...writes[0].patch }]), [])
  console.log('PASS partner migration is dry-run-first, preserving and idempotent')
}

main().catch((err) => { console.error(err.stack || err); process.exitCode = 1 })
