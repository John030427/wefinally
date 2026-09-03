'use strict'

const { passResult, failResult, applyCoordinationIdentity } = require('./_helpers')
const { createTestContext } = require('../harness/context')
const { createMatchLog } = require('../harness/matchService')
const { buildInvitationApp, buildPrimary } = require('../harness/serviceFactory')
const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { AGENT_TYPES } = require('../../../../miniprogram/cloudfunctions/api/agent/types')
const { assertThreadResume } = require('../assertions/agent')
const { createMemoryDb } = require('../harness/memoryDb')
const { createServices } = require('../harness/serviceFactory')
const { createPersonaPair } = require('../personas/factory')
const { saveMatchSetting } = require('../harness/profileService')
const { compileAiMatchProfile } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')

async function run() {
  const name = 'LANGGRAPH-RESUME'
  try {
    const runId = `e2e_${Date.now()}_lg`
    const db = createMemoryDb({ runId })
    const pair = createPersonaPair('G', 'H', runId, 190)
    applyCoordinationIdentity(pair)
    db.tables.user.push(pair.a.user, pair.b.user)
    db.tables.user_match_setting.push(pair.a.setting, pair.b.setting)
    for (const side of [pair.a, pair.b]) {
      const aiProfile = compileAiMatchProfile(Object.assign({}, side.user, side.setting))
      side.setting.ai_match_profile_json = JSON.stringify(aiProfile)
      await saveMatchSetting(db, side.user, side.setting)
    }

    const graphPayloads = []
    const services = createServices(db, {
      langgraphEnabled: true,
      env: { LANGGRAPH_ACTOR_SECRET: 'e2e-secret' },
      invokeGraphFunction: async (name, payload) => {
        graphPayloads.push(payload)
        return {
          result: {
            success: true,
            data: {
              status: 'awaiting_confirmation',
              threadId: payload.threadId,
              phase: 'awaiting_confirmation',
              replyDraft: 'Continuing coordination',
              coordinationVersion: payload.coordinationVersion || 1
            }
          }
        }
      }
    })

    const log = await createMatchLog(db, pair.a.user, pair.b.user)
    const created = await services.coordination.create({
      match_log_id: log.id,
      match_user_id: pair.b.user.id
    }, createTestContext(pair.a.user))

    await services.coordination.saveApplication(Object.assign({
      coordination_id: created.id,
      invitation_primary_proposal: buildPrimary()
    }, buildInvitationApp()), createTestContext(pair.a.user))

    let coordination = await db.byId('date_coordination', created.id)
    if (coordination.status === STATUS.INVITING_PARTNER) {
      coordination = await services.coordination.respondInvitation({
        coordination_id: created.id,
        decision: 'coordinate',
        invitation_version: 1
      }, createTestContext(pair.b.user))
    }

    const session = await services.agent.createSession({
      agent_type: AGENT_TYPES.DATE_COORDINATOR,
      coordination_id: created.id
    }, createTestContext(pair.a.user))

    await services.agent.send({ session_id: session.id, message: 'Turn1 area Futian ok' }, createTestContext(pair.a.user))
    await services.agent.send({ session_id: session.id, message: 'Turn2 activity coffee' }, createTestContext(pair.a.user))
    await services.agent.send({ session_id: session.id, message: 'Turn3 budget under 200' }, createTestContext(pair.a.user))

    const runs = (db.tables.agent_run || []).filter((r) => r.session_id === session.id)
    assertThreadResume(graphPayloads.length >= 2 ? graphPayloads : runs)

    return passResult(name, {
      personas: `G=${pair.a.user.id} H=${pair.b.user.id}`,
      expected: 'multi-turn thread resume',
      actual: `turns=${graphPayloads.length || runs.length}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'G/H' })
  }
}

module.exports = { run, id: 'langgraph-resume' }
