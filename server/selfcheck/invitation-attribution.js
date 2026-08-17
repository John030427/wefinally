const assert = require('assert')
const { ensureReferralAttribution, referralSource } = require('../../miniprogram/cloudfunctions/api/lib/partnerReferralAttributionPolicy')

async function main() {
  assert.strictEqual(referralSource('wf1.7.123.sig'), 'signed_token')
  assert.strictEqual(referralSource('WF7'), 'promote_code')

  const writes = []
  const byUser = new Map()
  const deps = {
    first: async (name, query) => byUser.get(Number(query && query.user_id)) || null,
    addWithId: async (name, data, prefix, stableId) => {
      const row = Object.assign({ id: writes.length + 1 }, data)
      writes.push({ name, data: row, stableId })
      byUser.set(Number(data.user_id), row)
      return row
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

  const other = { id: 12, promote_partner_id: 7, promote_code: 'WF7' }
  const third = await ensureReferralAttribution(other, partner, 'WF7', deps)
  assert.strictEqual(third.user_id, 12)
  assert.strictEqual(third.partner_id, 7)
  assert.strictEqual(writes.length, 2)
  assert.notStrictEqual(writes[1].stableId, writes[0].stableId)

  const otherPartner = { id: 9, promote_code: 'WF9' }
  const locked = await ensureReferralAttribution(user, otherPartner, 'WF9', deps)
  assert.strictEqual(locked.partner_id, 7)
  assert.strictEqual(writes.length, 2)

  console.log('PASS partner referral attribution is auditable and idempotent per user')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
