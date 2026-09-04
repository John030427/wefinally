'use strict'

const FIELD_RUNTIME_ADAPTER = Object.freeze({
  venue: 'activity_venue',
  payment: 'payment_preference'
})

const FIELD_CANONICAL_ADAPTER = Object.freeze({
  activity_venue: 'venue',
  payment_preference: 'payment'
})

const EVENT_RUNTIME_ADAPTER = Object.freeze({
  INVITATION_CREATED: 'invitation_created',
  INVITATION_ACCEPTED: 'invitation_accepted',
  INVITATION_DECLINED: 'invitation_declined',
  INVITATION_EXPIRED: 'invitation_expired',
  APPLICATION_SUBMITTED: 'application_submitted',
  PREFERENCES_UPDATED: 'preference_changed',
  COORDINATION_QUEUED: 'processing_queued',
  PLAN_CHANGE_PROPOSED: 'plan_change_proposed',
  PLAN_CHANGE_COMMITTED: 'plan_change_committed',
  PROPOSAL_GENERATED: 'proposal_generated',
  PARTNER_QUESTION: 'partner_question',
  PARTNER_RESPONSE: 'partner_response',
  ARRIVED: 'arrived',
  ARRIVAL_HINT_UPDATED: 'arrival_hint_updated',
  ARRIVAL_STATUS_REQUESTED: 'arrival_status_requested',
  DELAY_NOTICE: 'delay_notice',
  PROPOSAL_CONFIRMED: 'proposal_confirmed',
  PROPOSAL_REJECTED: 'proposal_rejected',
  COORDINATION_CANCELLED: 'coordination_cancelled',
  ARRANGED: 'arranged',
  NO_OVERLAP: 'no_overlap',
  OVERLAP_FOUND: 'overlap_found',
  RECOORDINATION_STARTED: 'recoordination_started',
  MANUAL_HANDOFF: 'manual_handoff',
  COORDINATION_UPDATED: 'coordination_updated',
  PROCESSING_FAILED: 'processing_failed',
  QA_COORDINATION_RESET: 'qa_coordination_reset',
  COORDINATION_CLOSED: 'coordination_closed',
  COORDINATION_EXPIRED: 'coordination_expired',
  PARTICIPANT_MET_CONFIRMED: 'participant_met_confirmed',
  PARTICIPANT_NOT_FOUND: 'participant_not_found',
  PARTICIPANT_MISMATCH: 'participant_mismatch',
  MEETING_ARRIVED: 'meeting_arrived',
  MEETING_NOT_FOUND: 'meeting_not_found',
  MEETING_MISMATCH: 'meeting_mismatch',
  POLITE_DECLINE: 'polite_decline',
  SHARE_TRIGGER: 'share_trigger',
  PROPOSAL_READY: 'proposal_ready'
})

const EVENT_LEGACY_ALIASES = Object.freeze({
  application_sent: 'APPLICATION_SUBMITTED',
  application_received: 'APPLICATION_SUBMITTED',
  preference_updated: 'PREFERENCES_UPDATED',
  partner_preference_changed: 'PREFERENCES_UPDATED',
  partner_inquiry: 'PARTNER_QUESTION',
  counter_offer_ready: 'PLAN_CHANGE_PROPOSED',
  participant_arrived: 'ARRIVED',
  coordination_arranged: 'ARRANGED',
  coordination_expiring: 'COORDINATION_EXPIRED',
  new_overlap_found: 'OVERLAP_FOUND',
  updated: 'COORDINATION_UPDATED'
})

const EVENT_PREFIX_ALIASES = Object.freeze([
  ['meeting_arrived:', 'MEETING_ARRIVED'],
  ['meeting_not_found:', 'MEETING_NOT_FOUND'],
  ['meeting_mismatch:', 'MEETING_MISMATCH']
])

const EVENT_MIGRATION_INVENTORY = Object.freeze([
  ...Object.entries(EVENT_RUNTIME_ADAPTER).map(([canonical, runtime]) => [runtime, canonical]),
  ...Object.entries(EVENT_LEGACY_ALIASES),
  ['meeting_arrived:<digest>', 'MEETING_ARRIVED'],
  ['meeting_not_found:<digest>', 'MEETING_NOT_FOUND'],
  ['meeting_mismatch:<digest>', 'MEETING_MISMATCH']
])

function toCanonicalCoordinationField(field) {
  const value = String(field || '')
  return FIELD_CANONICAL_ADAPTER[value] || value
}

function toRuntimeCoordinationField(field) {
  const value = String(field || '')
  return FIELD_RUNTIME_ADAPTER[value] || value
}

function toCanonicalCoordinationPlan(source) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {}
  const plan = {}
  const directFields = [
    'date', 'period', 'start_time', 'activity', 'activity_detail', 'venue', 'area',
    'budget', 'payment', 'duration', 'meet_point', 'arrival_status', 'arrival_hint',
    'delay_minutes', 'public_location', 'appearance_hint'
  ]
  for (const field of directFields) {
    if (value[field] !== undefined && value[field] !== null && value[field] !== '') plan[field] = value[field]
  }
  if (!plan.venue && value.activity_venue) plan.venue = value.activity_venue
  if (!plan.payment && value.payment_preference) plan.payment = value.payment_preference
  if (!plan.date && Array.isArray(value.availability) && value.availability[0]) {
    plan.date = value.availability[0].date
    if (!plan.period && Array.isArray(value.availability[0].periods)) plan.period = value.availability[0].periods[0]
  }
  if (!plan.area && Array.isArray(value.areas)) plan.area = value.areas[0]
  if (!plan.activity && Array.isArray(value.activities)) plan.activity = value.activities[0]
  if (!plan.activity_detail && value.other_requirements) plan.activity_detail = value.other_requirements
  return plan
}

function toRuntimeCoordinationChanges(changes, candidatePlan) {
  const value = changes && typeof changes === 'object' && !Array.isArray(changes) ? changes : {}
  const runtime = {}
  for (const [field, item] of Object.entries(value)) {
    if (field === 'date' || field === 'period' || field === 'start_time') continue
    if (field === 'area') runtime.areas = [item]
    else if (field === 'activity') runtime.activities = [item]
    else if (field === 'activity_detail') runtime.other_requirements = item
    else runtime[toRuntimeCoordinationField(field)] = item
  }
  const plan = candidatePlan && typeof candidatePlan === 'object' ? candidatePlan : {}
  if (value.date !== undefined || value.period !== undefined || value.start_time !== undefined) {
    runtime.availability = [{
      date: plan.date || value.date,
      periods: plan.period ? [plan.period] : (value.period ? [value.period] : [])
    }]
  }
  return runtime
}

function toCanonicalCoordinationChanges(changes) {
  const value = changes && typeof changes === 'object' && !Array.isArray(changes) ? changes : {}
  const canonical = {}
  for (const [field, item] of Object.entries(value)) {
    if (field === 'availability') {
      const first = Array.isArray(item) ? item[0] : null
      if (first && first.date) canonical.date = first.date
      if (first && Array.isArray(first.periods) && first.periods[0]) canonical.period = first.periods[0]
    } else if (field === 'areas' || field === 'activities') {
      if (Array.isArray(item) && item[0]) canonical[field === 'areas' ? 'area' : 'activity'] = item[0]
    } else if (field === 'other_requirements') {
      canonical.activity_detail = item
    } else {
      const target = toCanonicalCoordinationField(field)
      if (['date', 'period', 'start_time', 'activity', 'activity_detail', 'venue', 'area', 'budget', 'payment', 'duration'].includes(target)) {
        canonical[target] = item
      }
    }
  }
  return canonical
}

function toCanonicalCoordinationEventType(value) {
  const input = String(value || '')
  if (Object.prototype.hasOwnProperty.call(EVENT_RUNTIME_ADAPTER, input)) return input
  const runtime = Object.entries(EVENT_RUNTIME_ADAPTER).find(([, item]) => item === input)
  if (runtime) return runtime[0]
  if (EVENT_LEGACY_ALIASES[input]) return EVENT_LEGACY_ALIASES[input]
  const dynamic = EVENT_PREFIX_ALIASES.find(([prefix]) => input.startsWith(prefix))
  return dynamic ? dynamic[1] : null
}

function toRuntimeCoordinationEventType(value) {
  const input = String(value || '')
  const dynamic = EVENT_PREFIX_ALIASES.find(([prefix]) => input.startsWith(prefix))
  if (dynamic) return input
  const canonical = toCanonicalCoordinationEventType(value)
  return canonical ? EVENT_RUNTIME_ADAPTER[canonical] || null : null
}

module.exports = {
  COORDINATION_FIELD_RUNTIME_ADAPTER: FIELD_RUNTIME_ADAPTER,
  COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER: EVENT_RUNTIME_ADAPTER,
  COORDINATION_EVENT_TYPE_LEGACY_ALIASES: EVENT_LEGACY_ALIASES,
  COORDINATION_EVENT_TYPE_MIGRATION_INVENTORY: EVENT_MIGRATION_INVENTORY,
  toCanonicalCoordinationField,
  toRuntimeCoordinationField,
  toCanonicalCoordinationPlan,
  toRuntimeCoordinationChanges,
  toCanonicalCoordinationChanges,
  toCanonicalCoordinationEventType,
  toRuntimeCoordinationEventType
}
