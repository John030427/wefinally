const assert = require('assert')
const { planPartnerMigration, applyPartnerMigration } = require('../../miniprogram/cloudfunctions/api/lib/partnerMigrationPolicy')

async function main() {
  const legacy = { _id: 'partner_1', id: 1, name: '内测合伙人', promote_code: 'WFINNER', status: 1, balance: 0, password: 'legacy-hash' }
  const plan = planPartnerMigration([legacy])
  assert.deepStrictEqual(plan.map((item) => item.patch), [{ partner_code: 'WF-P-0001', binding_version: 1 }])
  assert.strictEqual(plan[0].preserved.promote_code, 'WFINNER')
  assert.strictEqual(plan[0].preserved.password, true)
  assert.strictEqual(plan[0].patch.promote_code, undefined)
  assert.strictEqual(plan[0].patch.password, undefined)

  const writes = []
  await assert.rejects(() => applyPartnerMigration(plan, { confirm: '', update: async () => {} }), /确认/)
  const result = await applyPartnerMigration(plan, {
    confirm: 'CONFIRM_PARTNER_MIGRATION',
    update: async (documentId, patch) => writes.push({ documentId, patch })
  })
  assert.strictEqual(result.updated, 1)
  assert.deepStrictEqual(writes, [{ documentId: 'partner_1', patch: { partner_code: 'WF-P-0001', binding_version: 1 } }])
  assert.deepStrictEqual(planPartnerMigration([{ ...legacy, ...writes[0].patch }]), [])
  console.log('PASS partner migration is dry-run-first, preserving and idempotent')
}

main().catch((err) => { console.error(err.stack || err); process.exitCode = 1 })
