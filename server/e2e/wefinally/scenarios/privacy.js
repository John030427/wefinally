'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { buildDateCoordinationGraphInput } = require('../../../../miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState')
const { assertCrossPartyPrivacy } = require('../assertions/privacy')

async function run() {
  const name = 'PRIVACY'
  try {
    const { db, services, pair } = await seedPair(null, 'Q', 'R', 170, { coordination: true })
    const privateNote = pair.b.setting._e2e_private_note || 'Worried about income but do not tell him directly.'

    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary(),
      other_requirements: privateNote,
      share_message: privateNote
    }, buildInvitationApp()), createTestContext(pair.a.user))

    const coordination = await db.byId('date_coordination', created.id)
    const applications = [{
      coordination_id: created.id,
      user_id: pair.b.user.id,
      coordination_version: coordination.coordination_version || 1,
      application: {
        areas: ['Futian'],
        activities: ['Coffee'],
        availability: [{ date: buildPrimary().date, periods: ['evening'] }],
        budget: '100-200',
        payment_preference: 'aa',
        duration: '1-2h',
        other_requirements: privateNote,
        share_message: privateNote,
        transport_constraints: privateNote
      }
    }]
    const graphInput = buildDateCoordinationGraphInput(
      coordination,
      applications,
      pair.a.user,
      { confirmations: [] }
    )

    assertCrossPartyPrivacy(graphInput, privateNote)

    return passResult(name, {
      personas: `Q=${pair.a.user.id} R=${pair.b.user.id}`,
      expected: 'A-facing graph excludes B raw private input',
      actual: 'no leak detected'
    })
  } catch (error) {
    return failResult(name, error, { personas: 'Q/R' })
  }
}

module.exports = { run, id: 'privacy' }
