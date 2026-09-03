'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { processCoordinationDeadlines } = require('../../../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { assertExpired } = require('../assertions/date')

async function run() {
  const name = 'NO-RESPONSE'
  try {
    const { db, services, pair } = await seedPair(null, 'M', 'N', 130, { coordination: true })
    pair.b.user.fixture_journey = 'no_response'
    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    const invited = await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary()
    }, buildInvitationApp()), createTestContext(pair.a.user))

    const row = db.tables.date_coordination.find((r) => Number(r.id) === Number(created.id))
    row.invitation_deadline_at = new Date(db.now().getTime() - 3600000)
    db.setNow(new Date(db.now().getTime() + 7200000))

    await processCoordinationDeadlines({
      deps: Object.assign({}, services, {
        list: db.list.bind(db),
        expireIfCurrent: async (row) => {
          await db.updateByDoc('date_coordination', row, { status: STATUS.EXPIRED, business_state: 'expired' })
          return true
        }
      }),
      now: db.now()
    })

    const expired = await db.byId('date_coordination', created.id)
    assertExpired(expired)

    return passResult(name, {
      personas: `M=${pair.a.user.id} N=${pair.b.user.id}`,
      expected: 'INVITING_PARTNER -> EXPIRED',
      actual: `status=${expired.status}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'M/N' })
  }
}

module.exports = { run, id: 'no-response' }
