const { computeOverlap, STATUS } = require('../lib/dateCoordinationPolicy')
const { invitationProposalOf, invitationVersionOf } = require('../lib/invitationCoordination')
const {
  toCanonicalCoordinationPlan,
  toCanonicalCoordinationChanges
} = require('../lib/coordinationAdapters.cjs')

function uniqueStrings(values, limit, maxLength) {
  return [...new Set((values || [])
    .map((value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, limit)
}

function dateWindows(availability) {
  const values = []
  for (const item of Array.isArray(availability) ? availability : []) {
    const date = String(item && item.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    for (const period of Array.isArray(item.periods) ? item.periods : []) {
      const value = String(period || '').trim()
      if (value) values.push(`${date}:${value}`)
    }
  }
  return uniqueStrings(values, 12, 64)
}

function durationMinutes(value) {
  return {
    'about-1h': 60,
    '1-2h': 90,
    '2-3h': 150
  }[String(value || '')]
}

function budgetBand(value) {
  return {
    'under-50': 'low',
    '50-100': 'low',
    '100-200': 'medium',
    'over-200': 'high'
  }[String(value || '')]
}

function emptyPreference() {
  return { dateWindows: [], regions: [], venueTypes: [] }
}

function positiveId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function normalizeContextRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const coordinationId = positiveId(value.coordination_id || value.coordinationId)
  const coordinationVersion = positiveId(value.coordination_version || value.coordinationVersion)
  const type = String(value.type || '')
  if (!coordinationId || !coordinationVersion) return null
  if (type === 'proposal') {
    const proposalId = positiveId(value.proposal_id || value.proposalId)
    return proposalId ? { type, coordination_id: coordinationId, coordination_version: coordinationVersion, proposal_id: proposalId } : null
  }
  if (type === 'patch_preview') {
    const patchId = positiveId(value.patch_id || value.patchId)
    return patchId ? { type, coordination_id: coordinationId, coordination_version: coordinationVersion, patch_id: patchId } : null
  }
  if (type === 'invitation') {
    const invitationVersion = positiveId(value.invitation_version || value.invitationVersion)
    return invitationVersion ? { type, coordination_id: coordinationId, coordination_version: coordinationVersion, invitation_version: invitationVersion } : null
  }
  if (type === 'partner_inquiry') {
    const inquiryId = positiveId(value.inquiry_id || value.inquiryId)
    const eventId = positiveId(value.event_id || value.eventId)
    if (!inquiryId && !eventId) return null
    return {
      type,
      coordination_id: coordinationId,
      coordination_version: coordinationVersion,
      ...(inquiryId ? { inquiry_id: inquiryId } : {}),
      ...(eventId ? { event_id: eventId } : {})
    }
  }
  if (type === 'meeting_status') {
    const eventId = positiveId(value.event_id || value.eventId)
    return {
      type,
      coordination_id: coordinationId,
      coordination_version: coordinationVersion,
      ...(eventId ? { event_id: eventId } : {})
    }
  }
  return null
}

function safePreference(application) {
  const source = application && typeof application === 'object' ? application : {}
  const result = {
    dateWindows: dateWindows(source.availability),
    regions: uniqueStrings(source.areas, 8, 40),
    venueTypes: uniqueStrings(source.activities, 8, 32)
  }
  const duration = durationMinutes(source.duration)
  const budget = budgetBand(source.budget)
  if (duration !== undefined) result.durationMinutes = duration
  if (budget !== undefined) result.budgetBand = budget
  return result
}

function latestApplication(rows, userId, coordinationVersion) {
  return (rows || [])
    .filter((row) => Number(row.user_id) === Number(userId))
    .filter((row) => Number(row.coordination_version || 0) <= Number(coordinationVersion || 1))
    .sort((a, b) => Number(b.coordination_version || 0) - Number(a.coordination_version || 0))[0] || null
}

function canonicalFromBackend(overlap, status, options = {}) {
  if (status === STATUS.COLLECTING_INITIATOR) {
    return {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: ['own_preference'],
      conflictDimensions: [],
      commonTime: [],
      commonArea: [],
      commonActivity: [],
      budgetCompatibility: '',
      paymentCompatibility: '',
      durationCompatibility: '',
      proposal: null
    }
  }
  if (status === STATUS.INVITING_PARTNER) {
    return {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: ['partner'],
      conflictDimensions: [],
      commonTime: [],
      commonArea: [],
      commonActivity: [],
      budgetCompatibility: '',
      paymentCompatibility: '',
      durationCompatibility: '',
      proposal: null
    }
  }
  if (options.waitingInviteePreference) {
    return {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: options.party === 'B' ? ['own_preference'] : ['partner'],
      conflictDimensions: [],
      commonTime: [],
      commonArea: [],
      commonActivity: [],
      budgetCompatibility: '',
      paymentCompatibility: '',
      durationCompatibility: '',
      proposal: null
    }
  }
  const missing = Array.isArray(overlap && overlap.missing_dimensions) ? overlap.missing_dimensions.slice() : []
  const first = overlap && Array.isArray(overlap.proposals) ? overlap.proposals[0] : null
  const hasOverlap = Boolean(first) && missing.length === 0
  return {
    source: 'backend',
    hasOverlap,
    missingDimensions: missing,
    conflictDimensions: missing.filter((item) => item !== 'partner'),
    commonTime: hasOverlap ? [`${first.date}:${first.period}`] : [],
    commonArea: first && first.area ? [first.area] : [],
    commonActivity: first && first.activity ? [first.activity] : [],
    budgetCompatibility: first ? String(first.budget || '') : '',
    paymentCompatibility: first ? String(first.payment_preference || '') : '',
    durationCompatibility: first ? String(first.duration || '') : '',
    proposal: first
      ? {
        dateWindow: `${first.date}:${first.period}`,
        region: first.area,
        venueType: first.activity,
        date: first.date,
        period: first.period,
        start_time: first.start_time,
        activity: first.activity,
        activity_detail: first.activity_detail,
        activity_venue: first.activity_venue,
        area: first.area,
        budget: first.budget,
        payment_preference: first.payment_preference,
        duration: first.duration,
        proposal_id: first.id
      }
      : null
  }
}

function partnerProgress(coordination, applications, confirmations, user) {
  const status = String(coordination.status || '')
  if (status === STATUS.INVITING_PARTNER) return 'waiting'
  const partnerId = Number(user.id) === Number(coordination.user_a_id)
    ? Number(coordination.user_b_id)
    : Number(coordination.user_a_id)
  const version = Number(coordination.coordination_version || 1)
  const partnerApp = latestApplication(applications, partnerId, version)
  const partnerConfirmed = (confirmations || []).some((row) => (
    Number(row.user_id) === partnerId
    && row.decision === 'confirm'
    && Number(row.coordination_version || 0) === version
  ))
  if (partnerConfirmed || status === STATUS.ARRANGED) return 'confirmed'
  if (partnerApp) return 'submitted'
  if (status === STATUS.COLLECTING_PREFERENCES) return 'accepted'
  return 'waiting'
}

function confirmationSnapshot(coordination, confirmations, user) {
  const version = Number(coordination.coordination_version || 1)
  const mine = (confirmations || []).some((row) => (
    Number(row.user_id) === Number(user.id)
    && row.decision === 'confirm'
    && Number(row.coordination_version || 0) === version
  ))
  const partnerId = Number(user.id) === Number(coordination.user_a_id)
    ? Number(coordination.user_b_id)
    : Number(coordination.user_a_id)
  const partner = (confirmations || []).some((row) => (
    Number(row.user_id) === partnerId
    && row.decision === 'confirm'
    && Number(row.coordination_version || 0) === version
  ))
  return {
    myConfirmed: mine,
    partnerConfirmed: partner,
    proposalStatus: coordination.status === STATUS.ARRANGED
      ? 'arranged'
      : (coordination.status === STATUS.WAITING_CONFIRMATIONS ? 'awaiting_confirmation' : 'none'),
    source: 'database'
  }
}

function pendingPreviewFromBackend(patch, currentPlan, coordinationId) {
  if (!patch || Number(patch.id || 0) <= 0) return null
  const preview = patch.preview && typeof patch.preview === 'object' ? patch.preview : {}
  const after = toCanonicalCoordinationPlan(preview.after || patch.changes || {})
  const candidatePlan = Object.assign({}, currentPlan || {}, after)
  const partnerRequest = preview.partner_request || patch.coordination_partner_request || null
  return {
    patchId: Number(patch.id),
    baseVersion: Number(patch.base_version || 0),
    candidatePlan,
    candidateChanges: toCanonicalCoordinationChanges(patch.changes || preview.source_changes || {}),
    ...(partnerRequest ? { partnerRequest } : {}),
    contextRef: {
      type: 'patch_preview',
      coordination_id: Number(coordinationId),
      coordination_version: Number(patch.base_version || 0),
      patch_id: Number(patch.id)
    }
  }
}

function buildDateCoordinationGraphInput(coordination, applications, user, options = {}) {
  const version = Number(coordination.coordination_version || 1)
  const party = Number(user.id) === Number(coordination.user_a_id) ? 'A' : 'B'
  const ownRow = latestApplication(applications, user.id, version)
  const ownPreference = safePreference(ownRow && ownRow.application)
  const empty = emptyPreference()
  const initiatorApp = latestApplication(applications, coordination.user_a_id, version)
  const inviteeApp = latestApplication(applications, coordination.user_b_id, version)
  const waitingInviteePreference = coordination.status === STATUS.COLLECTING_PREFERENCES && !inviteeApp
  let overlap = { proposals: [], missing_dimensions: waitingInviteePreference ? ['partner'] : ['partner'] }
  if (![STATUS.INVITING_PARTNER, STATUS.COLLECTING_INITIATOR].includes(coordination.status) && initiatorApp && inviteeApp) {
    overlap = computeOverlap(initiatorApp.application, inviteeApp.application, { version })
  }
  const canonicalOverlap = canonicalFromBackend(overlap, coordination.status, {
    waitingInviteePreference,
    party
  })
  const persistedProposal = (options.proposals || [])
    .filter((proposal) => Number(proposal.coordination_version || 0) === version)
    .filter((proposal) => proposal.status === 'active' || Number(proposal.id) === Number(coordination.final_proposal_id || 0))
    .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0] || null
  if (persistedProposal && canonicalOverlap.proposal) {
    canonicalOverlap.proposal = Object.assign({}, canonicalOverlap.proposal, {
      ...toCanonicalCoordinationPlan(persistedProposal),
      proposal_id: Number(persistedProposal.id)
    })
  }
  const confirmations = options.confirmations || []
  const snapshot = confirmationSnapshot(coordination, confirmations, user)
  const actionRequired = canonicalOverlap.hasOverlap
    ? 'confirm_or_adjust'
    : (canonicalOverlap.missingDimensions.includes('own_preference')
      ? 'clarify_overrides'
      : (canonicalOverlap.missingDimensions.includes('partner')
        ? (waitingInviteePreference ? 'wait_invitee_preference' : 'wait_partner')
        : 'adjust_unresolved_dimension'))
  const invitationProposal = invitationProposalOf(coordination, initiatorApp)
  const runtimePlan = canonicalOverlap.proposal || invitationProposal
  const currentPlan = runtimePlan && Object.keys(runtimePlan).length
    ? toCanonicalCoordinationPlan(runtimePlan)
    : null
  const pendingPreview = pendingPreviewFromBackend(options.pendingPatch, currentPlan, coordination.id)
  const proposalId = positiveId(runtimePlan && (runtimePlan.id || runtimePlan.proposal_id))
  const suppliedContextRef = normalizeContextRef(options.contextRef)
  const activeContextRef = suppliedContextRef
    || (pendingPreview && pendingPreview.contextRef)
    || (proposalId
      ? {
        type: 'proposal',
        coordination_id: Number(coordination.id),
        coordination_version: version,
        proposal_id: proposalId
      }
      : (invitationVersionOf(coordination, initiatorApp) > 0
        ? {
          type: 'invitation',
          coordination_id: Number(coordination.id),
          coordination_version: version,
          invitation_version: invitationVersionOf(coordination, initiatorApp)
        }
        : null))
  const canonicalState = {
    coordination_id: Number(coordination.id),
    coordination_version: version,
    status: String(coordination.status || ''),
    ...(coordination.business_state ? { business_state: String(coordination.business_state) } : {}),
    party,
    current_plan: currentPlan,
    canonical_overlap: canonicalOverlap,
    shared_state: {
      commonTime: canonicalOverlap.commonTime,
      commonArea: canonicalOverlap.commonArea,
      commonActivity: canonicalOverlap.commonActivity,
      missingDimensions: canonicalOverlap.missingDimensions,
      activeProposalSummary: canonicalOverlap.proposal,
      actionRequired
    },
    own_preference: ownPreference,
    partner_progress: partnerProgress(coordination, applications, confirmations, user),
    confirmation_snapshot: snapshot,
    ...(invitationVersionOf(coordination, initiatorApp) > 0
      ? { invitation_version: invitationVersionOf(coordination, initiatorApp) }
      : {}),
    ...(runtimePlan && Number(runtimePlan.id || runtimePlan.proposal_id || 0) > 0
      ? { current_proposal_id: Number(runtimePlan.id || runtimePlan.proposal_id) }
      : {})
  }
  return {
    coordinationId: Number(coordination.id),
    coordinationVersion: version,
    party,
    ownPreference,
    partyAState: party === 'A' ? ownPreference : empty,
    partyBState: party === 'B' ? ownPreference : empty,
    canonicalOverlap,
    sharedState: {
      commonTime: canonicalOverlap.commonTime,
      commonArea: canonicalOverlap.commonArea,
      commonActivity: canonicalOverlap.commonActivity,
      budgetCompatibility: canonicalOverlap.budgetCompatibility,
      paymentCompatibility: canonicalOverlap.paymentCompatibility,
      durationCompatibility: canonicalOverlap.durationCompatibility,
      missingDimensions: canonicalOverlap.missingDimensions,
      activeProposalSummary: canonicalOverlap.proposal,
      actionRequired
    },
    partnerProgress: partnerProgress(coordination, applications, confirmations, user),
    confirmationSnapshot: snapshot,
    canonicalState,
    pendingPreview: pendingPreview || null,
    ...(activeContextRef ? { contextRef: activeContextRef } : {})
  }
}

module.exports = {
  emptyPreference,
  safePreference,
  latestApplication,
  canonicalFromBackend,
  buildDateCoordinationGraphInput,
  normalizeContextRef
}
