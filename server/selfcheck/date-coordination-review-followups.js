const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const { SAFE_PUBLIC_ERROR_CODES, declaredPublicCode } = require('../../miniprogram/cloudfunctions/api/lib/publicErrorCodes')
const { businessError, attachPublicError } = require('../../miniprogram/cloudfunctions/api/lib/businessError')
const { computeOverlap } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { enrichChangesWithDerivedClears } = require('../../miniprogram/cloudfunctions/api/lib/dateApplicationDerivedFields')
const {
  DIMENSION_ORDER,
  buildStructuredCounterProposal,
  applyAcceptedCounterProposal
} = require('../../miniprogram/cloudfunctions/api/lib/dateCounterOfferPolicy')
const { exactTimeFromText } = require('../../miniprogram/cloudfunctions/api/lib/meetingPlanPolicy')
const cloudLabels = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationLabels')
const clientLabels = require('../../miniprogram/utils/dateCoordinationLabels')
const { createReminderJob } = require('../../miniprogram/cloudfunctions/api/agent/notificationJobs')
const { buildInAppNotification } = require('../../miniprogram/cloudfunctions/api/lib/coordinationNotification')
const { notifyInbox } = require('../../miniprogram/cloudfunctions/api/lib/coordinationInbox')
const {
  createDateCoordinationHandlers,
  defaultDeps: buildDateCoordinationDefaultDeps
} = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

async function main() {
  assert.strictEqual(typeof buildDateCoordinationDefaultDeps, 'function', 'defaultDeps must be exported for production wiring checks')
  const dateCoordinationSource = read('miniprogram/cloudfunctions/api/handlers/dateCoordination.js')
  const defaultDepsBlock = dateCoordinationSource.slice(
    dateCoordinationSource.indexOf('function defaultDeps()'),
    dateCoordinationSource.indexOf('async function qaResetAllowedFor')
  )
  assert(defaultDepsBlock.includes('claimPendingPatch'), 'production defaultDeps missing claimPendingPatch')
  assert(
    defaultDepsBlock.includes('commitPreAcceptInvitationPatch: db.commitPreAcceptInvitationPatch'),
    'production defaultDeps missing commitPreAcceptInvitationPatch'
  )
  assert(
    defaultDepsBlock.includes('commitPostAcceptApplicationPatch: db.commitPostAcceptApplicationPatch'),
    'production defaultDeps missing commitPostAcceptApplicationPatch'
  )
  assert(dateCoordinationSource.includes('unitMode === true'), 'CRUD inference must be replaced by explicit unitMode')
  assert(
    !/claimPendingPatch' && overrides\.first && overrides\.addWithId/.test(dateCoordinationSource),
    'production must not infer memory claimPendingPatch from first/addWithId'
  )
  const agentSource = read('miniprogram/cloudfunctions/api/handlers/agent.js')
  assert(
    agentSource.includes("claimPendingPatch: dep('claimPendingPatch')"),
    'AI session must inject claimPendingPatch into date coordination handlers'
  )
  assert(
    agentSource.includes("commitPostAcceptApplicationPatchDep = dep('commitPostAcceptApplicationPatch')")
      || agentSource.includes("commitPost = dep('commitPostAcceptApplicationPatch')"),
    'AI session must inject commitPostAcceptApplicationPatch into date coordination handlers'
  )
  assert(
    agentSource.includes('createDateCoordinationHandlers(coordinationHandlerDeps)'),
    'AI session must construct date coordination handlers with explicit production deps'
  )

  let claimCount = 0
  let postCommitCount = 0
  const nowAccept = new Date('2026-09-03T12:00:00Z')
  const maleApp = {
    availability: [{ date: '2026-09-04', periods: ['afternoon'] }],
    areas: ['南山'],
    activities: ['咖啡'],
    budget: 'under-50',
    payment_preference: 'aa',
    duration: 'about-1h'
  }
  const femaleApp = {
    availability: [{ date: '2026-09-06', periods: ['afternoon'] }],
    areas: ['南山'],
    activities: ['咖啡'],
    budget: 'under-50',
    payment_preference: 'aa',
    duration: 'about-1h'
  }
  const acceptTables = {
    date_coordination: [{
      id: 88,
      _id: 'coord_88',
      user_a_id: 1,
      user_b_id: 2,
      status: 'no_overlap',
      coordination_version: 2,
      last_changed_by_user_id: 2,
      last_changed_dimensions: ['time'],
      missing_dimensions: ['time'],
      invitation_primary_proposal: {
        date: '2026-09-04',
        period: 'afternoon',
        area: '南山',
        activity: '咖啡',
        budget: 'under-50',
        duration: 'about-1h',
        payment_mode: 'aa',
        payer_user_id: 0
      }
    }],
    date_coordination_application: [
      {
        id: 1,
        _id: 'app_1',
        coordination_id: 88,
        user_id: 1,
        coordination_version: 2,
        preference_version: 1,
        application: maleApp,
        preference_evidence: {
          availability: 'explicit',
          areas: 'explicit',
          activities: 'explicit',
          budget: 'explicit',
          payment_preference: 'explicit',
          duration: 'explicit'
        }
      },
      {
        id: 2,
        _id: 'app_2',
        coordination_id: 88,
        user_id: 2,
        coordination_version: 2,
        preference_version: 1,
        application: femaleApp,
        preference_evidence: {
          availability: 'explicit',
          areas: 'inherited',
          activities: 'inherited',
          budget: 'inherited',
          payment_preference: 'inherited',
          duration: 'inherited'
        }
      }
    ],
    date_application_patch: [],
    date_coordination_event: [],
    date_coordination_proposal: [],
    agent_notification_job: [],
    coordination_notification: [],
    user_notification_cursor: []
  }
  let acceptId = 10
  const offerForAccept = buildStructuredCounterProposal({
    coordination: acceptTables.date_coordination[0],
    applicationA: maleApp,
    applicationB: femaleApp,
    applicationRowA: acceptTables.date_coordination_application[0],
    applicationRowB: acceptTables.date_coordination_application[1],
    invitationPrimary: acceptTables.date_coordination[0].invitation_primary_proposal,
    viewerUserId: 1
  })
  assert(offerForAccept && offerForAccept.proposal_token)

  const acceptHandlers = createDateCoordinationHandlers({
    unitMode: true,
    currentUser: async () => ({ id: 1 }),
    first: async (name, query) => (acceptTables[name] || []).find((row) => Object.keys(query).every((key) => row[key] === query[key])) || null,
    list: async (name, query) => (acceptTables[name] || []).filter((row) => !query || Object.keys(query).every((key) => row[key] === query[key])),
    byId: async (name, id) => (acceptTables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      const row = Object.assign({ id: acceptId++, _id: `${name}_${acceptId}` }, data)
      if (!acceptTables[name]) acceptTables[name] = []
      acceptTables[name].push(row)
      return row
    },
    updateByDoc: async (_name, doc, data) => Object.assign(doc, data, { update_time: nowAccept }),
    now: () => nowAccept,
    publishCoordinationEvent: async () => ({ messages: [] }),
    writeInboxNotification: async () => ({ created: true }),
    claimPendingPatch: async (patch) => {
      claimCount += 1
      const current = acceptTables.date_application_patch.find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    },
    commitPreAcceptInvitationPatch: async () => {
      throw new Error('unexpected pre-accept commit for no_overlap counter offer')
    },
    commitPostAcceptApplicationPatch: async (input) => {
      postCommitCount += 1
      const coordination = acceptTables.date_coordination[0]
      Object.assign(coordination, {
        coordination_version: Number(input.nextCoordinationVersion || coordination.coordination_version + 1),
        status: 'computing_overlap',
        update_time: nowAccept
      })
      const mine = acceptTables.date_coordination_application.find((row) => Number(row.user_id) === 1)
      Object.assign(mine, {
        application: input.nextApplication,
        coordination_version: coordination.coordination_version,
        preference_version: Number(input.nextPreferenceVersion || (mine.preference_version || 0) + 1)
      })
      const patch = acceptTables.date_application_patch.find((row) => Number(row.id) === Number(input.patch && input.patch.id))
      if (patch) Object.assign(patch, { status: 'applied', applied_version: coordination.coordination_version, applied_at: nowAccept })
      return { coordination, application: mine, patch }
    }
  })
  await acceptHandlers.acceptCounterOfferForUser({
    coordination_id: 88,
    coordination_version: 2,
    proposal_token: offerForAccept.proposal_token
  }, { id: 1 })
  assert.strictEqual(claimCount, 1, 'acceptCounterOffer must call claimPendingPatch once')
  assert.strictEqual(postCommitCount, 1, 'acceptCounterOffer must call commitPostAcceptApplicationPatch once')

  assert(SAFE_PUBLIC_ERROR_CODES.has('COUNTER_OFFER_STALE'))
  assert(SAFE_PUBLIC_ERROR_CODES.has('QA_RESET_FORBIDDEN'))
  const sample = businessError('STALE_INVITATION_VERSION', '这份邀请已更新，请刷新后查看最新内容')
  assert.strictEqual(declaredPublicCode(sample), 'STALE_INVITATION_VERSION')
  assert.strictEqual(sample.publicMessage.length <= 40, true)
  const indexSource = read('miniprogram/cloudfunctions/api/index.js')
  assert(indexSource.includes('declaredPublicCode'))
  assert(indexSource.includes('SERVER_ERROR'))

  assert.throws(
    () => computeOverlap(
      { availability: [{ date: '2026-09-10', periods: ['night'] }], areas: ['南山'], activities: ['咖啡'], budget: 'flexible', payment_preference: 'flexible', duration: '1-2h' },
      { availability: [{ date: '2026-09-10', periods: ['night'] }], areas: ['南山'], activities: ['咖啡'], budget: 'flexible', payment_preference: 'self_pays', duration: '1-2h' },
      { version: 2 }
    ),
    /computeOverlap requires user ids/
  )
  const overlap = computeOverlap(
    { availability: [{ date: '2026-09-10', periods: ['night'] }], areas: ['南山'], activities: ['咖啡'], budget: 'flexible', payment_preference: 'flexible', duration: '1-2h' },
    { availability: [{ date: '2026-09-10', periods: ['night'] }], areas: ['南山'], activities: ['咖啡'], budget: 'flexible', payment_preference: 'self_pays', duration: '1-2h' },
    { version: 2, user_a_id: 1, user_b_id: 2 }
  )
  assert(overlap.proposals.length >= 1)
  assert(overlap.proposals[0].payment_mode)

  const derived = enrichChangesWithDerivedClears(
    { availability: [{ date: '2026-09-10', periods: ['night'] }], start_time: '20:00', activities: ['电影'], areas: ['南山'], activity_venue: '旧影城' },
    { availability: [{ date: '2026-09-11', periods: ['night'] }], activities: ['散步'], areas: ['福田'] }
  )
  assert.strictEqual(derived.start_time, '')
  assert.strictEqual(derived.activity_venue, '')

  assert.deepStrictEqual(DIMENSION_ORDER, [
    'time', 'area', 'activity', 'budget', 'payment', 'duration', 'exact_time', 'activity_venue'
  ])
  const counter = buildStructuredCounterProposal({
    coordination: {
      status: 'no_overlap',
      coordination_version: 3,
      user_a_id: 1,
      user_b_id: 2,
      missing_dimensions: ['time'],
      last_changed_by_user_id: 1,
      last_changed_dimensions: ['time', 'exact_time']
    },
    applicationA: {
      availability: [{ date: '2026-09-13', periods: ['night'] }],
      start_time: '20:00',
      activity_venue: '海岸城星巴克',
      areas: ['南山区'],
      activities: ['咖啡'],
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h'
    },
    applicationB: {
      availability: [{ date: '2026-09-12', periods: ['night'] }],
      start_time: '22:04',
      activity_venue: '海岸城星巴克',
      areas: ['南山区'],
      activities: ['咖啡'],
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h'
    },
    applicationRowA: { preference_evidence: { availability: 'explicit', start_time: 'explicit' } },
    invitationPrimary: {
      date: '2026-09-12',
      period: 'night',
      start_time: '22:04',
      activity_venue: '海岸城星巴克',
      area: '南山区',
      activity: '咖啡',
      budget: '100-200',
      payment_mode: 'aa',
      payer_user_id: 0,
      duration: '1-2h'
    },
    viewerUserId: 2
  })
  assert(counter && counter.proposal_token)
  assert(counter.changes.some((item) => item.dimension === 'time'))
  assert(counter.changes.some((item) => item.dimension === 'exact_time'))
  const accepted = applyAcceptedCounterProposal({
    availability: [{ date: '2026-09-12', periods: ['night'] }],
    start_time: '22:04',
    activity_venue: '海岸城星巴克',
    areas: ['南山区'],
    activities: ['咖啡'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h'
  }, counter)
  assert.strictEqual(accepted.start_time, '20:00')
  assert.deepStrictEqual(accepted.availability, [{ date: '2026-09-13', periods: ['night'] }])

  assert.strictEqual(exactTimeFromText('8点', { period: 'night' }), '20:00')
  assert.strictEqual(exactTimeFromText('预算100:'), '')

  assert.deepStrictEqual(cloudLabels.PERIOD_LABELS, clientLabels.PERIOD_LABELS)
  assert.strictEqual(clientLabels.periodLabel('night'), '晚上')
  const wxml = read('miniprogram/pages/date-coordination/date-coordination.wxml')
  assert(wxml.includes('dateItem.periodsText'))
  assert(!wxml.includes('已选择：{{dateItem.periods}}'))
  assert(wxml.includes('item.periodText || item.period') || wxml.includes('item.periodText'))
  assert(wxml.indexOf('counter-offer-card') < wxml.indexOf('coordinator-hero') || wxml.includes('counter-offer-card'))
  assert(wxml.includes('qa-reset-card'))

  const now = new Date('2026-09-03T12:00:00Z')
  assert.equal(createReminderJob({
    coordinationId: 1, userId: 2, stage: 'invitation_created', deadlineAt: '2026-09-03T18:00:00Z', now
  }), null)

  const notification = buildInAppNotification({
    coordination_id: 9,
    user_id: 2,
    event_type: 'preference_changed',
    coordination_version: 4
  })
  assert.strictEqual(notification.idempotency_key, '9:preference_changed:4:2')
  const tables = { coordination_notification: [], user_notification_cursor: [] }
  let id = 1
  const deps = {
    first: async (name, query) => (tables[name] || []).find((row) => Object.keys(query).every((key) => row[key] === query[key])) || null,
    addWithId: async (name, data) => {
      const row = Object.assign({ id: id++, _id: `${name}_${id}` }, data)
      tables[name].push(row)
      return row
    },
    updateByDoc: async (_name, row, data) => Object.assign(row, data),
    now: () => now,
    config: { wechatEnabled: false, templateIds: [] },
    sendSubscribeMessage: async () => ({ sent: false, reason: 'disabled' })
  }
  await notifyInbox({
    coordination: { id: 9, coordination_version: 4 },
    user_id: 2,
    event_type: 'preference_changed',
    coordination_version: 4,
    title: '对方更新了可约条件',
    body: '请查看'
  }, deps)
  await notifyInbox({
    coordination: { id: 9, coordination_version: 4 },
    user_id: 2,
    event_type: 'preference_changed',
    coordination_version: 4,
    title: '对方更新了可约条件',
    body: '请查看'
  }, deps)
  assert.strictEqual(tables.coordination_notification.length, 1)

  const meetingSource = read('miniprogram/cloudfunctions/api/lib/meetingCheckInService.js')
  assert(meetingSource.includes('safeDigest(arrivalPosition)'))
  assert(meetingSource.includes('safeDigest(hint)'))
  assert(!/idempotency_suffix: action === 'set_arrival_hint'\s*\n\s*\? hint/.test(meetingSource))

  const appWxss = read('miniprogram/app.wxss')
  const usedTokens = new Set()
  for (const file of [
    'miniprogram/pages/date-coordination/date-coordination.wxss',
    'miniprogram/pages/chat/chat.wxss',
    'miniprogram/app.wxss'
  ]) {
    const source = read(file)
    for (const match of source.matchAll(/var\((--wf-[a-z0-9-]+)\)/g)) usedTokens.add(match[1])
  }
  for (const token of usedTokens) {
    assert(appWxss.includes(`${token}:`), `missing token ${token}`)
  }

  console.log('PASS date coordination review followups')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
