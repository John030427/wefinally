const assert = require('assert')
const { phoneDigest } = require('../../miniprogram/cloudfunctions/api/lib/partnerOnboardingPolicy')
const { createPartnerOnboardingService } = require('../../miniprogram/cloudfunctions/api/lib/partnerOnboardingService')

const secret = 'partner-phone-lookup-secret-for-service-selfcheck'

function fakeDeps() {
  const state = {
    partner_candidate: [{
      _id: 'partner_candidate_10',
      id: 10,
      source: 'roster',
      phone_digest: phoneDigest('13800001234', secret),
      phone_masked: '138****1234',
      review_status: 'approved',
      activation_status: 'unbound',
      partner_id: 0
    }],
    partner: [],
    partner_binding: [],
    partner_audit_log: []
  }
  const tx = {
    async byId(name, id) {
      return (state[name] || []).find((row) => Number(row.id) === Number(id)) || null
    },
    async byDocId(name, documentId) {
      return (state[name] || []).find((row) => row._id === documentId) || null
    },
    async nextCounter(name) {
      assert.strictEqual(name, 'partner_support_code')
      return 1
    },
    async addWithId(name, data) {
      const id = name === 'partner' ? 21 : 31
      const row = { _id: `${name}_${id}`, id, ...data }
      state[name].push(row)
      return row
    },
    async updateByDoc(name, row, data) {
      Object.assign(row, data)
      return row
    },
    async setByDocId(name, documentId, data) {
      const existing = (state[name] || []).find((row) => row._id === documentId)
      if (existing) {
        Object.assign(existing, data)
        return existing
      }
      const row = { _id: documentId, ...data }
      state[name].push(row)
      return row
    },
    now() {
      return new Date('2026-08-14T10:00:00.000Z')
    }
  }
  return {
    state,
    async transaction(work) {
      return work(tx)
    }
  }
}

async function main() {
  const deps = fakeDeps()
  const service = createPartnerOnboardingService(deps, { phoneSecret: secret })
  const result = await service.activate({
    candidate_id: 10,
    verified_phone: '+86 138 0000 1234',
    current_user_id: 7,
    request_id: 'activate-10-user-7'
  })

  assert.deepStrictEqual(result, {
    id: 21,
    partner_code: 'WF-P-0001',
    promote_code: 'WFP0001',
    status: 1,
    binding_version: 1
  })
  assert.strictEqual(deps.state.partner[0].user_id, 7)
  assert.strictEqual(deps.state.partner[0].candidate_id, 10)
  assert.strictEqual(deps.state.partner[0].phone_digest, phoneDigest('13800001234', secret))
  assert.strictEqual(deps.state.partner_candidate[0].activation_status, 'bound')
  assert.strictEqual(deps.state.partner_candidate[0].partner_id, 21)
  assert.strictEqual(deps.state.partner_audit_log.length, 1)
  assert.strictEqual(deps.state.partner_binding[0].partner_id, 21)
  assert.strictEqual(deps.state.partner_audit_log[0].action, 'activate')
  assert.strictEqual(deps.state.partner_audit_log[0].verified_phone, undefined)
  assert.strictEqual(deps.state.partner_audit_log[0].phone_digest, undefined)

  const repeated = await service.activate({
    candidate_id: 10,
    verified_phone: '13800001234',
    current_user_id: 7,
    request_id: 'activate-10-user-7'
  })
  assert.deepStrictEqual(repeated, result)
  assert.strictEqual(deps.state.partner.length, 1)
  assert.strictEqual(deps.state.partner_audit_log.length, 1)

  await assert.rejects(() => service.activate({
    candidate_id: 10,
    verified_phone: '13800001234',
    current_user_id: 8,
    request_id: 'activate-other-user'
  }), /已绑定其他微信用户|未获资格或验证不一致/)

  console.log('PASS partner onboarding activation service is atomic and idempotent')
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exitCode = 1
})
