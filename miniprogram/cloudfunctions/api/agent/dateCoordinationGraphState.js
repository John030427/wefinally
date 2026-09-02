const { computeOverlap, STATUS } = require('../lib/dateCoordinationPolicy')
const {
  buildInvitationCard,
  invitationProposalOf,
  invitationPrimaryOf,
  invitationVersionOf
} = require('../lib/invitationCoordination')
const { buildStructuredCounterProposal } = require('../lib/dateCounterOfferPolicy')

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
        venueType: first.activity
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
  const invitationPrimary = options.invitationPrimary || invitationPrimaryOf(coordination, initiatorApp, {
    user_a_id: coordination.user_a_id,
    user_b_id: coordination.user_b_id
  })
  const counterOffer = buildStructuredCounterProposal({
    coordination,
    applicationA: initiatorApp && initiatorApp.application,
    applicationB: inviteeApp && inviteeApp.application,
    applicationRowA: initiatorApp,
    applicationRowB: inviteeApp,
    invitationPrimary,
    viewerUserId: user.id
  })
  const confirmations = options.confirmations || []
  const snapshot = confirmationSnapshot(coordination, confirmations, user)
  const invitationPreference = invitationProposalOf(coordination, initiatorApp)
  const invitationCard = buildInvitationCard(invitationPrimary || invitationPreference, invitationVersionOf(coordination, initiatorApp), {
    primary: invitationPrimary,
    preference: invitationPreference,
    user_a_id: coordination.user_a_id,
    user_b_id: coordination.user_b_id
  })
  const coordinationPath = counterOffer
    ? 'structured_counter_proposal'
    : (coordination.status === STATUS.INVITING_PARTNER
      ? (party === 'B' ? 'direct_invitation_response' : 'waiting_invitation_response')
      : (waitingInviteePreference && party === 'B'
        ? 'partial_override_from_invitation'
        : (canonicalOverlap.hasOverlap ? 'confirm_computed_proposal' : 'bilateral_preference_matching')))
  const actionRequired = counterOffer
    ? 'review_counter_proposal'
    : (canonicalOverlap.hasOverlap
    ? 'confirm_or_adjust'
    : (canonicalOverlap.missingDimensions.includes('own_preference')
      ? 'clarify_overrides'
      : (canonicalOverlap.missingDimensions.includes('partner')
        ? (waitingInviteePreference ? 'wait_invitee_preference' : 'wait_partner')
        : 'adjust_unresolved_dimension')))
  return {
    coordinationId: Number(coordination.id),
    coordinationVersion: version,
    party,
    ownPreference,
    ownEvidence: ownRow && ownRow.preference_evidence ? ownRow.preference_evidence : null,
    partyAState: party === 'A' ? ownPreference : empty,
    partyBState: party === 'B' ? ownPreference : empty,
    canonicalOverlap,
    sharedState: {
      invitationCard: {
        time_text: invitationCard.time_text,
        area_text: invitationCard.area_text,
        activity_text: invitationCard.activity_text,
        activity_venue_text: invitationCard.activity_venue_text || '',
        meet_point_text: invitationCard.meet_point_text || '',
        meeting_ready: Boolean(invitationCard.meeting_ready),
        budget_text: invitationCard.budget_text,
        duration_text: invitationCard.duration_text,
        invitation_version: invitationCard.invitation_version
      },
      commonTime: canonicalOverlap.commonTime,
      commonArea: canonicalOverlap.commonArea,
      commonActivity: canonicalOverlap.commonActivity,
      budgetCompatibility: canonicalOverlap.budgetCompatibility,
      paymentCompatibility: canonicalOverlap.paymentCompatibility,
      durationCompatibility: canonicalOverlap.durationCompatibility,
      missingDimensions: canonicalOverlap.missingDimensions,
      unresolvedDimensions: (canonicalOverlap.conflictDimensions || []).slice(),
      activeProposalSummary: canonicalOverlap.proposal,
      counterOffer,
      coordinationPath,
      proposalBaseAvailable: Boolean(invitationCard.primary_complete),
      planIssue: invitationCard.meeting_conflict
        ? {
          code: String(invitationCard.meeting_conflict.code || 'ACTIVITY_VENUE_CONFLICT'),
          message: String(invitationCard.meeting_conflict.message || '活动与场地需要确认').slice(0, 240)
        }
        : (Number(invitationCard.contract_version || 1) >= 2 && !invitationCard.meeting_ready
          ? {
            code: 'MEETING_PLAN_INCOMPLETE',
            message: '请补充具体开始时间、活动场地和公共集合点，再确认最终方案。到场识别提示可在双方确认后分别补充。'
          }
          : null),
      actionRequired
    },
    partnerProgress: partnerProgress(coordination, applications, confirmations, user),
    confirmationSnapshot: snapshot
  }
}

module.exports = {
  emptyPreference,
  safePreference,
  latestApplication,
  canonicalFromBackend,
  buildDateCoordinationGraphInput
}
