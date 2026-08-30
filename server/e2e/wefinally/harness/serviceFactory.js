'use strict'

const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { createDateCoordinationHandlers } = require('../../../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { createDateApplicationPatchHandlers } = require('../../../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
const { createAgentHandlers } = require('../../../../miniprogram/cloudfunctions/api/handlers/agent')
const { createExperienceFeedbackHandlers } = require('../../../../miniprogram/cloudfunctions/api/handlers/experienceFeedback')
const { publishCoordinationEvent } = require('../../../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { currentUserFactory } = require('./context')
const { updateProfileForUser, saveMatchSetting } = require('./profileService')
const { createAiProvider } = require('./aiProvider')

const DEFAULT_E2E_NOW = '2026-08-20T08:00:00.000Z'

function futureDate(days, from) {
  const value = new Date(from || DEFAULT_E2E_NOW)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function buildInvitationApp(pref = {}, overrides = {}) {
  const fri = futureDate(5)
  return Object.assign({
    availability: [{ date: fri, periods: ['evening'] }],
    areas: ['南山'],
    activities: ['咖啡'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }, pref, overrides)
}

function buildPrimary(pref = {}) {
  const slot = pref.availability && pref.availability[0]
  const date = slot ? slot.date : futureDate(5)
  const period = slot && slot.periods && slot.periods[0] ? slot.periods[0] : 'evening'
  return {
    date,
    period,
    area: (pref.areas && pref.areas[0]) || '\u5357\u5c71',
    activity: (pref.activities && pref.activities[0]) || '\u5496\u5561',
    budget: '100-200',
    duration: '1-2h',
    payment_mode: 'aa',
    payer_user_id: 0
  }
}

function createServices(db, options = {}) {
  const currentUser = currentUserFactory(db)
  const ai = createAiProvider(options)

  const publishEvent = (input) => publishCoordinationEvent(input, {
    first: db.first.bind(db),
    addWithId: db.addWithId.bind(db),
    now: db.now.bind(db)
  })

  const invokeGraphFunction = options.invokeGraphFunction
    || ((name, payload) => ai.invokeGraphFunction(name, payload))

  const baseDeps = {
    currentUser,
    first: db.first.bind(db),
    list: db.list.bind(db),
    byId: db.byId.bind(db),
    addWithId: db.addWithId.bind(db),
    updateByDoc: db.updateByDoc.bind(db),
    claimPendingPatch: db.claimPendingPatch.bind(db),
    now: db.now.bind(db),
    publishCoordinationEvent: publishEvent,
    writeInboxNotification: async () => null,
    setDoc: async (name, id, data) => {
      const tables = db.tables[name] || []
      const existing = tables.find((row) => row._id === id)
      const payload = Object.assign({}, data, { _id: id, update_time: db.now() })
      if (existing) return db.updateByDoc(name, existing, payload)
      if (!payload.create_time) payload.create_time = db.now()
      tables.push(payload)
      db.tables[name] = tables
      return payload
    },
    env: Object.assign({}, process.env, options.env || {}, {
      LANGGRAPH_ENABLED: options.langgraphEnabled ? 'true' : 'false'
    }),
    generateDecision: (input) => ai.generateDecision(input),
    invokeGraphFunction
  }

  const coordination = createDateCoordinationHandlers(Object.assign({}, baseDeps, options.coordinationOverrides || {}))
  const patches = createDateApplicationPatchHandlers(Object.assign({}, baseDeps, {
    saveApplicationForUser: (data, user) => coordination.saveApplicationForUser(data, user)
  }))
  const agent = createAgentHandlers(baseDeps)
  const feedback = createExperienceFeedbackHandlers(baseDeps)

  return {
    db,
    ai,
    currentUser,
    coordination,
    patches,
    agent,
    feedback,
    profile: {
      update: (user, data) => updateProfileForUser(db, user, data),
      saveSetting: (user, data) => saveMatchSetting(db, user, data)
    },
    helpers: {
      futureDate,
      buildInvitationApp,
      buildPrimary
    }
  }
}

async function runWorker(db, coordinationRow) {
  const { processCoordinationTasks } = require('../../../../miniprogram/cloudfunctions/api/handlers/dateCoordinationWorker')
  await processCoordinationTasks({
    now: db.now(),
    deps: {
      listTasks: async () => (db.tables.date_coordination || []).filter((r) => r.status === STATUS.COMPUTING_OVERLAP && r.processing_status === 'queued'),
      claimTask: async (task) => db.updateByDoc('date_coordination', task, {
        processing_status: 'processing',
        processing_token: 'e2e',
        business_state: 'processing'
      }),
      listApplications: async (coordId, version) => (db.tables.date_coordination_application || []).filter((r) => Number(r.coordination_id) === Number(coordId) && Number(r.coordination_version) === Number(version)),
      completeTask: async (claim, overlap) => {
        const proposals = []
        for (const proposal of overlap.proposals || []) {
          proposals.push(await db.addWithId('date_coordination_proposal', Object.assign({}, proposal, {
            coordination_id: Number(claim.id),
            status: 'active',
            coordination_version: Number(claim.coordination_version || 1)
          }), 'date_coordination_proposal'))
        }
        const hasProposals = proposals.length > 0
        return db.updateByDoc('date_coordination', claim, {
          status: hasProposals ? STATUS.WAITING_CONFIRMATIONS : STATUS.NO_OVERLAP,
          business_state: hasProposals ? 'proposal_generated' : 'waiting_partner',
          processing_status: '',
          processing_token: '',
          missing_dimensions: hasProposals ? [] : (overlap.missing_dimensions || [])
        })
      },
      now: db.now.bind(db)
    }
  })
}

module.exports = {
  createServices,
  runWorker,
  buildInvitationApp,
  buildPrimary,
  futureDate
}
