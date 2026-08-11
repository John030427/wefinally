const assert = require('assert')
const { ensureReferralAttribution, referralSource } = require('../../miniprogram/cloudfunctions/api/lib/partnerReferralAttributionPolicy')

async function main() {
  assert.strictEqual(referralSource('wf1.7.123.sig'), 'signed_token')
  assert.strictEqual(referralSource('WF7'), 'promote_code')

  const writes = []
  let existing = null
  const deps = {
    first: async () => existing,
    addWithId: async (name, data, prefix, stableId) => {
      writes.push({ name, data })
      writes[writes.length - 1].stableId = stableId
      existing = Object.assign({ id: 1 }, data)
      return existing
    },
    now: () => '2026-08-12T00:00:00.000Z'
  }
  const user = { id: 11, promote_partner_id: 7, promote_code: 'WF7' }
  const partner = { id: 7, promote_code: 'WF7' }
  const first = await ensureReferralAttribution(user, partner, 'wf1.7.123.sig', deps)
  const second = await ensureReferralAttribution(user, partner, 'WF7', deps)

  assert.strictEqual(first.partner_id, 7)
  assert.strictEqual(first.user_id, 11)
  assert.strictEqual(first.source_type, 'signed_token')
  assert.strictEqual(first.attribution_locked, true)
  assert.strictEqual(writes[0].stableId, user.id)
  assert.strictEqual(second.id, first.id)
  assert.strictEqual(writes.length, 1)
  assert.strictEqual(writes[0].name, 'partner_referral_attribution')

  console.log('PASS partner referral attribution is auditable and idempotent per user')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
