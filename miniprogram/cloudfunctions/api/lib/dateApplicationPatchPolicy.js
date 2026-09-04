const {
  ACTIVITIES,
  BUDGETS,
  PAYMENT_PREFERENCES,
  DURATIONS,
  normalizeApplication
} = require('./dateCoordinationPolicy')

const PATCH_TOOL = 'create_date_application_patch'
const PATCHABLE_FIELDS = Object.freeze([
  'availability',
  'areas',
  'activities',
  'activity_venue',
  'budget',
  'payment_preference',
  'duration',
  'transport_constraints',
  'other_requirements',
  'share_message'
])

const DIMENSION_LABELS = Object.freeze({
  availability: 'time',
  areas: 'area',
  activities: 'activity',
  budget: 'budget',
  payment_preference: 'payment',
  duration: 'duration',
  transport_constraints: 'transport',
  other_requirements: 'requirements',
  share_message: 'share_message',
  activity_venue: 'venue'
})

const PARTNER_REQUEST_TYPES = new Set(['ASK_ACCEPTANCE', 'ASK_PREFERENCE', 'ASK_STATUS', 'ASK_ARRIVAL', 'RELAY'])

function normalizePartnerRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const type = String(value.type || '').trim()
  const topic = String(value.topic || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160)
  if (!PARTNER_REQUEST_TYPES.has(type) || !topic) return null
  return { type, topic }
}

function cleanChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('修改参数格式无效')
  const keys = Object.keys(changes)
  if (!keys.length) throw new Error('没有可预览的修改')
  if (keys.some((key) => !PATCHABLE_FIELDS.includes(key))) throw new Error('修改字段不在允许列表中')
  return keys.reduce((out, key) => {
    out[key] = changes[key]
    return out
  }, {})
}

function changedFields(before, after) {
  return PATCHABLE_FIELDS.filter((key) => JSON.stringify(before && before[key]) !== JSON.stringify(after && after[key]))
}

function previewApplicationChange(currentApplication, changes, options = {}) {
  const safeChanges = cleanChanges(changes)
  const after = normalizeApplication(Object.assign({}, currentApplication || {}, safeChanges), options.now || new Date())
  const fields = changedFields(currentApplication || {}, after)
  if (!fields.length) throw new Error('修改前后没有变化')
  const before = fields.reduce((out, key) => {
    out[key] = currentApplication[key]
    return out
  }, {})
  const afterChanged = fields.reduce((out, key) => {
    out[key] = after[key]
    return out
  }, {})
  return {
    before,
    after: afterChanged,
    changed_fields: fields,
    affects_existing_proposal: Boolean(options.hasActiveProposal),
    will_notify_partner: options.notifyPartner !== false
  }
}

function shareableSummary(preview) {
  const dimensions = (preview && preview.changed_fields || [])
    .map((field) => DIMENSION_LABELS[field])
    .filter(Boolean)
  return {
    changed_dimensions: dimensions,
    requires_partner_response: dimensions.some((item) => ['time', 'area', 'activity', 'budget', 'payment', 'duration'].includes(item))
  }
}

module.exports = {
  PATCH_TOOL,
  PATCHABLE_FIELDS,
  previewApplicationChange,
  shareableSummary,
  cleanChanges,
  normalizePartnerRequest
}
