'use strict'

const assert = require('assert')
const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { AGENT_TYPES } = require('../../../../miniprogram/cloudfunctions/api/agent/types')
const { assertStatus, assertPatchPending } = require('../assertions/date')
const { assertPatchPreview } = require('../assertions/agent')

async function inviteAndCoordinate(ctx) {
  const { db, services, pair } = ctx
  const log = await createMatchLog(db, pair.a.user, pair.b.user)
  const created = await services.coordination.create({
    match_log_id: log.id,
    match_user_id: pair.b.user.id
  }, createTestContext(pair.a.user))

  const prefA = pair.a.setting._e2e_date_pref || {}
  const app = buildInvitationApp(prefA)
  const primary = buildPrimary(prefA)
  const invited = await services.coordination.saveApplication(Object.assign({
    coordination_id: created.id
  }, app, { invitation_primary_proposal: primary }), createTestContext(pair.a.user))

  let coordinated = await db.byId('date_coordination', created.id)
  if (coordinated.status === STATUS.INVITING_PARTNER) {
    coordinated = await services.coordination.respondInvitation({
      coordination_id: created.id,
      decision: 'coordinate',
      invitation_version: invited.invitation_version || 1
    }, createTestContext(pair.b.user))
  }

  return { created, invited, coordinated, log }
}

async function run() {
  const name = 'DATE-COORDINATE'
  try {
    const ctx = await seedPair(null, 'G', 'H', 70, { coordination: true })
    const { db, services, pair } = ctx
    const { created, coordinated } = await inviteAndCoordinate(ctx)

    assert.ok([
      STATUS.COLLECTING_PREFERENCES,
      STATUS.COMPUTING_OVERLAP,
      STATUS.NO_OVERLAP,
      STATUS.WAITING_CONFIRMATIONS
    ].includes(coordinated.status), `unexpected status ${coordinated.status}`)

    const session = await services.agent.createSession({
      agent_type: AGENT_TYPES.DATE_COORDINATOR,
      coordination_id: created.id
    }, createTestContext(pair.a.user))

    const versionBefore = db.tables.date_coordination[0].coordination_version
    const patchReply = await services.agent.send({
      session_id: session.id,
      message: 'If Nanshan is hard, Futian works too'
    }, createTestContext(pair.a.user))
    assertPatchPreview(patchReply)
    assertPatchPending(patchReply.patch_preview)

    return passResult(name, {
      personas: `G=${pair.a.user.id} H=${pair.b.user.id}`,
      expected: 'coordinate -> patch preview, no direct DB write',
      actual: `status=${coordinated.status} patch=${patchReply.patch_preview.status} version=${versionBefore}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'G/H' })
  }
}

module.exports = { run, id: 'date-coordinate' }
