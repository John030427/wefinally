'use strict'

const { seedPair, passResult, failResult } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { resolvePrimaryAfterPreferenceChange } = require('../../../../miniprogram/cloudfunctions/api/lib/invitationCoordination')

async function run() {
  const name = 'PRIMARY-RESOLUTION'
  try {
    const { db, services, pair } = await seedPair(null, 'O', 'P', 150, { coordination: true })
    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    const pref = { areas: ['南山', '福田', '罗湖'], activities: ['咖啡'] }
    const invited = await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary({ areas: ['南山'] })
    }, buildInvitationApp(pref)), createTestContext(pair.a.user))

    const resolution = resolvePrimaryAfterPreferenceChange(
      buildPrimary({ areas: ['南山'] }),
      {
        areas: ['福田', '罗湖'],
        activities: ['咖啡'],
        availability: [{ date: buildPrimary().date, periods: ['evening'] }],
        budget: '100-200',
        duration: '1-2h',
        payment_preference: 'aa'
      },
      { user_a_id: pair.a.user.id, user_b_id: pair.b.user.id }
    )

    if (!resolution.required) throw new Error('expected primary_resolution_required')
    const areaField = (resolution.fields || []).find((item) => item.field === 'area')
    if (!areaField || (areaField.options || []).length < 2) {
      throw new Error('must expose 福田/罗湖 choices')
    }

    return passResult(name, {
      personas: `O=${pair.a.user.id} P=${pair.b.user.id}`,
      expected: 'primary_resolution_required for 福田/罗湖',
      actual: `required=${resolution.required} choices=${(areaField.options || []).join(',')}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'O/P' })
  }
}

module.exports = { run, id: 'primary-resolution' }
