const { computeOverlap, STATUS } = require('../lib/dateCoordinationPolicy')

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

function canonicalFromBackend(overlap, status) {
  if (status === STATUS.INVITING_PARTNER || status === STATUS.COLLECTING_INITIATOR) {
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
  let overlap = { proposals: [], missing_dimensions: ['partner'] }
  if (![STATUS.INVITING_PARTNER, STATUS.COLLECTING_INITIATOR].includes(coordination.status)) {
    const applicationA = latestApplication(applications, coordination.user_a_id, version)
    const applicationB = latestApplication(applications, coordination.user_b_id, version)
    if (applicationA && applicationA.application && applicationB && applicationB.application) {
      overlap = computeOverlap(applicationA.application, applicationB.application, { version })
    } else {
      overlap = { proposals: [], missing_dimensions: ['partner'] }
    }
  }
  const canonicalOverlap = canonicalFromBackend(overlap, coordination.status)
  const confirmations = options.confirmations || []
  const snapshot = confirmationSnapshot(coordination, confirmations, user)
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
      actionRequired: canonicalOverlap.hasOverlap
        ? 'confirm_or_adjust'
        : (canonicalOverlap.missingDimensions.includes('partner') ? 'wait_partner' : 'adjust_own_preference')
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
