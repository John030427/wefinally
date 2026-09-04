'use strict'

const {
  toCanonicalCoordinationPlan,
  toCanonicalCoordinationEventType,
  toRuntimeCoordinationEventType
} = require('../../agent-graph/shared/coordinationAdapters.cjs')

const CORE_PLAN_FIELDS = Object.freeze(['date', 'start_time', 'activity', 'venue'])
const SOFT_PLAN_FIELDS = Object.freeze(['area', 'budget', 'payment', 'duration'])

const DIMENSION_LABELS = Object.freeze({
  availability: '时间',
  date: '日期',
  period: '时段',
  start_time: '开始时间',
  area: '区域',
  activity: '活动',
  venue: '活动场地',
  budget: '预算',
  payment: '费用方式',
  duration: '时长',
  meet_point: '集合点'
})

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function canonicalPlan(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {}
  const plan = toCanonicalCoordinationPlan(raw)
  if (!hasValue(plan.payment) && hasValue(raw.payment_mode)) plan.payment = raw.payment_mode
  if (!hasValue(plan.payment) && hasValue(raw.payment_preference)) plan.payment = raw.payment_preference
  return plan
}

function buildCanonicalPlanProjection(input = {}) {
  const source = input.current_plan || input.currentPlan || input.plan || null
  const currentPlan = source ? canonicalPlan(source) : null
  const missingCore = currentPlan
    ? CORE_PLAN_FIELDS.filter((field) => !hasValue(currentPlan[field]))
    : CORE_PLAN_FIELDS.slice()
  const flexibleFields = SOFT_PLAN_FIELDS.filter((field) => (
    (Array.isArray(input.flexible_fields) && input.flexible_fields.includes(field))
      || String(currentPlan && currentPlan[field] || '').toLowerCase() === 'flexible'
  ))
  const deferredFields = currentPlan && !hasValue(currentPlan.meet_point) ? ['meet_point'] : []
  return {
    current_plan: currentPlan,
    plan_state: {
      core_ready: missingCore.length === 0,
      missing_core: missingCore,
      flexible_fields: flexibleFields,
      deferred_fields: deferredFields
    }
  }
}

function safeChangedDimensions(value) {
  const values = Array.isArray(value) ? value : []
  return Array.from(new Set(values
    .map((item) => String(item || '').trim())
    .map((item) => item === 'activity_venue' ? 'venue' : (item === 'payment_preference' ? 'payment' : item))
    .filter((item) => Object.prototype.hasOwnProperty.call(DIMENSION_LABELS, item))))
}

function buildCoordinationEventCard(input = {}) {
  const event = input.event && typeof input.event === 'object' ? input.event : input
  const canonicalType = toCanonicalCoordinationEventType(event.event_type || event.type || 'COORDINATION_UPDATED')
  const runtimeType = toRuntimeCoordinationEventType(event.event_type || event.type || canonicalType || 'COORDINATION_UPDATED')
  const safeSummary = event.safe_summary && typeof event.safe_summary === 'object' ? event.safe_summary : {}
  const shareableSummary = event.shareable_summary && typeof event.shareable_summary === 'object'
    ? event.shareable_summary
    : {}
  const summary = String(input.content || event.content || safeSummary.content || safeSummary.relay_text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240)
  const changedDimensions = safeChangedDimensions(
    event.changed_dimensions || shareableSummary.changed_dimensions
  )
  const eventId = Number(event.id || event.event_id || event.coordination_event_id || 0)
  const card = {
    source: 'coordination_event',
    event_id: eventId,
    event_type: canonicalType || 'COORDINATION_UPDATED',
    runtime_event_type: runtimeType || String(event.event_type || 'coordination_updated'),
    coordination_id: Number(event.coordination_id || 0),
    coordination_version: Number(event.coordination_version || 0),
    changed_dimensions: changedDimensions,
    changed_dimensions_text: changedDimensions.map((item) => DIMENSION_LABELS[item]).join('、'),
    proposal_key: String(event.proposal_key || safeSummary.proposal_key || '').slice(0, 120),
    summary
  }
  return card
}

module.exports = {
  CORE_PLAN_FIELDS,
  SOFT_PLAN_FIELDS,
  DIMENSION_LABELS,
  canonicalPlan,
  buildCanonicalPlanProjection,
  safeChangedDimensions,
  buildCoordinationEventCard
}
