const assert = require('assert')
const { createPartnerOnboardingHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/partnerOnboarding')

function fakeDeps() {
  const tables = {
    user: [{ _id: 'user_15', id: 15, openid: 'openid-15', city: '汕头' }],
    partner_candidate: [],
    partner: [],
    partner_audit_log: []
  }
  let nextId = 20
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    tables,
    consumedCodes: [],
    now: () => new Date('2026-08-14T12:00:00.000Z'),
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
    },
    async consumePhoneCode(code) {
      this.consumedCodes.push(code)
      if (code !== 'wx-phone-code') throw new Error('手机号授权已失效')
      return '13800001234'
    },
    async activate(input) {
      const candidate = tables.partner_candidate.find((row) => row.id === input.candidate_id)
      const partner = { _id: 'partner_7', id: 7, user_id: input.current_user_id, candidate_id: candidate.id, status: 1, binding_version: 1, partner_code: 'WF-P-0007', promote_code: 'WFP0007', phone_masked: candidate.phone_masked }
      tables.partner.push(partner)
      candidate.partner_id = partner.id
      candidate.activation_status = 'bound'
      return partner
    },
    signPartnerToken(partner) {
      return `session:${partner.id}:v${partner.binding_version}`
    }
  }
}

async function main() {
  const deps = fakeDeps()
  const handlers = createPartnerOnboardingHandlers(deps, {
    phoneSecret: 'partner-handler-phone-lookup-secret-for-selfcheck'
  })
  const wxContext = { OPENID: 'openid-15' }

  const initial = await handlers.status({}, wxContext)
  assert.strictEqual(initial.state, 'not_applied')
  assert.deepStrictEqual(initial.allowed_actions, ['apply', 'verify'])

  const application = await handlers.apply({
    phone: '138 0000 1234',
    city: '汕头',
    circle_note: '本地创业者圈层',
    reason: '愿意协助审核',
    request_id: 'apply-1'
  }, wxContext)
  assert.strictEqual(application.review_status, 'pending')
  assert.strictEqual(application.phone_masked, '138****1234')
  assert.strictEqual(application.phone_digest, undefined)
  assert.strictEqual(deps.tables.partner_candidate[0].phone, undefined)
  assert.strictEqual(deps.tables.partner_audit_log[0].request_id, 'apply-1')
  assert.strictEqual(deps.tables.partner_audit_log[0].phone_digest, undefined)

  const pending = await handlers.status({}, wxContext)
  assert.strictEqual(pending.state, 'pending')
  deps.tables.partner_candidate[0].review_status = 'approved'

  const active = await handlers.activate({ phone_code: 'wx-phone-code', request_id: 'activate-1' }, wxContext)
  assert.strictEqual(active.state, 'active')
  assert.strictEqual(active.partner.partner_code, 'WF-P-0007')
  assert.strictEqual(active.session.token, 'session:7:v1')
  assert.strictEqual(active.session.binding_version, 1)
  assert.deepStrictEqual(deps.consumedCodes, ['wx-phone-code'])
  assert.strictEqual(JSON.stringify(deps.tables).includes('wx-phone-code'), false)

  const restored = await handlers.session({}, wxContext)
  assert.strictEqual(restored.token, 'session:7:v1')
  deps.tables.partner[0].status = 2
  await assert.rejects(() => handlers.session({}, wxContext), /停用/)

  console.log('PASS partner onboarding status, application, activation and session handlers')
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exitCode = 1
})
