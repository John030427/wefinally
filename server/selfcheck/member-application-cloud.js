const assert = require('assert')

const { createMemberHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/member')

const user = {
  _id: 'user_8',
  id: 8,
  status: 1,
  member_status: 'pending_profile',
  promote_partner_id: 3,
  promote_code: 'GRACE',
  gender: 2,
  birth_year: 1995,
  height_range: '160-170cm',
  education: '本科',
  city: '深圳',
  marry_status: '未婚',
  baby_plan: '2-3年内',
  circle_id: 0,
  occupation_description: '工业设计师'
}
const setting = {
  user_id: 8,
  age_min: 28,
  age_max: 38,
  height_min: 170,
  height_max: 190,
  min_education: '本科',
  like_marry_status: '仅看未婚',
  like_baby_plan: '2-3年内',
  self_view_text: '我重视坦诚沟通、稳定关系和共同成长，希望认真经营长期关系。',
  target_view_text: '期待对方愿意坦诚沟通，对婚姻负责，并能一起规划未来生活。'
}

async function main() {
  const writes = []
  const handlers = createMemberHandlers({
    currentUser: async () => ({ ...user }),
    first: async (name) => name === 'user_match_setting' ? setting : null,
    list: async () => [],
    byId: async (name, id) => name === 'partner' && Number(id) === 3
      ? { id: 3, status: 1, promote_code: 'GRACE' }
      : null,
    addWithId: async (name, data) => {
      const row = { _id: `${name}_1`, id: 1, ...data }
      writes.push({ name, data: row })
      return row
    },
    updateByDoc: async (name, doc, data) => {
      writes.push({ name, data })
      return { ...doc, ...data }
    },
    now: () => new Date('2026-07-11T00:00:00.000Z')
  })

  const result = await handlers.submit({}, {})
  assert.strictEqual(result.status, 'pending_review')
  assert.strictEqual(result.revision, 1)
  assert.strictEqual(result.assigned_partner_id, 3)
  assert.ok(result.profile_snapshot_json.includes('工业设计师'))
  assert.strictEqual(writes[1].data.member_status, 'pending_review')

  const status = await handlers.status({}, {})
  assert.strictEqual(status.member_status, 'pending_profile')
  assert.strictEqual(status.can_submit, true)

  const invalid = createMemberHandlers({
    currentUser: async () => ({ ...user, occupation_description: '' }),
    first: async () => setting,
    list: async () => [],
    byId: async () => ({ id: 3, status: 1 }),
    addWithId: async () => { throw new Error('should not write') },
    updateByDoc: async () => { throw new Error('should not write') }
  })
  await assert.rejects(() => invalid.submit({}, {}), /职业描述/)

  const signedWrites = []
  const signedHandlers = createMemberHandlers({
    currentUser: async () => ({ ...user }),
    first: async (name) => {
      if (name === 'user_match_setting') return setting
      if (name === 'partner_referral_attribution') {
        return { user_id: 8, partner_id: 3, source_type: 'signed_token', attribution_locked: true }
      }
      return null
    },
    list: async () => [],
    byId: async (name, id) => name === 'partner' && Number(id) === 3
      ? { id: 3, status: 1, promote_code: 'GRACE' }
      : null,
    addWithId: async (name, data) => {
      const row = { _id: `${name}_${signedWrites.length + 1}`, id: signedWrites.length + 1, ...data }
      signedWrites.push({ name, data: row })
      return row
    },
    updateByDoc: async (name, doc, data) => {
      signedWrites.push({ name, data })
      return { ...doc, ...data }
    },
    now: () => new Date('2026-08-12T00:00:00.000Z')
  })
  const signed = await signedHandlers.submit({}, {})
  assert.strictEqual(signed.status, 'approved')
  assert.strictEqual(signed.reviewed_by_role, 'partner_referral_auto')
  assert(signedWrites.some((row) => row.name === 'partner_user_audit_log' && row.data.action === 'auto_approve'))
  assert(signedWrites.some((row) => row.name === 'user' && row.data.member_status === 'approved'))

  const ordinaryWrites = []
  const ordinaryHandlers = createMemberHandlers({
    currentUser: async () => ({ ...user, promote_partner_id: 0, promote_code: '' }),
    first: async (name) => name === 'user_match_setting' ? setting : null,
    list: async () => [],
    byId: async () => { throw new Error('ordinary registration must not require a partner') },
    addWithId: async (name, data) => {
      const row = { _id: `${name}_${ordinaryWrites.length + 1}`, id: ordinaryWrites.length + 1, ...data }
      ordinaryWrites.push({ name, data: row })
      return row
    },
    updateByDoc: async (name, doc, data) => {
      ordinaryWrites.push({ name, data })
      return { ...doc, ...data }
    },
    now: () => new Date('2026-08-15T00:00:00.000Z')
  })
  const ordinary = await ordinaryHandlers.submit({}, {})
  assert.strictEqual(ordinary.status, 'pending_review')
  assert.strictEqual(ordinary.inviter_partner_id, 0)
  assert.strictEqual(ordinary.assigned_partner_id, 0)

  console.log('PASS cloud member application')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
