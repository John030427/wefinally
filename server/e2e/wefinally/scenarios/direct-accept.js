'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { assertDirectAccept } = require('../assertions/date')

async function run() {
  const name = 'DIRECT-ACCEPT'
  try {
    const { db, services, pair } = await seedPair(null, 'I', 'J', 90, { coordination: true })
    pair.b.user.fixture_journey = 'accept_direct'
    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    const pref = pair.b.setting._e2e_date_pref || {}
    const invited = await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary(pref)
    }, buildInvitationApp(pref)), createTestContext(pair.a.user))

    const accepted = await services.coordination.respondInvitation({
      coordination_id: created.id,
      decision: 'accept',
      invitation_version: invited.invitation_version || 1
    }, createTestContext(pair.b.user))

    assertDirectAccept(accepted)
    return passResult(name, {
      personas: `I=${pair.a.user.id} J=${pair.b.user.id}`,
      expected: 'ARRANGED',
      actual: `status=${accepted.status}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'I/J' })
  }
}

module.exports = { run, id: 'direct-accept' }
