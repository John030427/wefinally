'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { assertDeclined } = require('../assertions/date')

async function run() {
  const name = 'DECLINE'
  try {
    const { db, services, pair } = await seedPair(null, 'K', 'L', 110, { coordination: true })
    pair.b.user.fixture_journey = 'decline'
    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    const invited = await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary()
    }, buildInvitationApp()), createTestContext(pair.a.user))

    const declined = await services.coordination.respondInvitation({
      coordination_id: created.id,
      decision: 'decline',
      invitation_version: invited.invitation_version || 1
    }, createTestContext(pair.b.user))

    assertDeclined(declined)
    return passResult(name, {
      personas: `K=${pair.a.user.id} L=${pair.b.user.id}`,
      expected: 'INVITATION_DECLINED',
      actual: `status=${declined.status}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'K/L' })
  }
}

module.exports = { run, id: 'decline' }
