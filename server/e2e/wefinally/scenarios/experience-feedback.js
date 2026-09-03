'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

async function run() {
  const name = 'EXPERIENCE-FEEDBACK'
  try {
    const { db, services, pair } = await seedPair(null, 'I', 'J', 210, { coordination: true })
    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    const invited = await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary()
    }, buildInvitationApp()), createTestContext(pair.a.user))

    const accepted = await services.coordination.respondInvitation({
      coordination_id: created.id,
      decision: 'accept',
      invitation_version: invited.invitation_version || 1
    }, createTestContext(pair.b.user))

    if (accepted.status !== STATUS.ARRANGED) {
      await db.updateByDoc('date_coordination', await db.byId('date_coordination', created.id), {
        status: STATUS.ARRANGED,
        business_state: 'completed',
        final_proposal_id: 1
      })
    }

    await services.feedback.saveMatch({
      match_log_id: log.id,
      verdict: 'accurate',
      comment: 'E2E synthetic feedback'
    }, createTestContext(pair.a.user))

    const rows = db.tables.match_experience_feedback || []
    if (rows.length !== 1) throw new Error(`expected 1 match feedback row, got ${rows.length}`)

    return passResult(name, {
      personas: `I=${pair.a.user.id}`,
      expected: 'post-date/match feedback saved',
      actual: `rows=${rows.length} verdict=${rows[0].verdict}`
    })
  } catch (error) {
    return failResult(name, error)
  }
}

module.exports = { run, id: 'experience-feedback' }
