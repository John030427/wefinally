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

const RELAY_FIELD_LABELS = Object.freeze({
  availability: '时间',
  areas: '区域',
  activities: '活动',
  activity_venue: '活动场地',
  budget: '预算',
  payment_preference: '费用方式',
  duration: '时长',
  transport_constraints: '出行限制',
  other_requirements: '其他要求',
  share_message: '对方可见内容'
})

const RELAY_PERIOD_LABELS = Object.freeze({
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
  night: '夜间'
})

function relayValue(field, value) {
  if (value === undefined || value === null || value === '') return '未设置'
  if (field === 'availability' && Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object') return String(item || '')
      return [item.date, RELAY_PERIOD_LABELS[item.period] || item.period]
        .filter(Boolean)
        .join(' ')
    }).filter(Boolean).join('、') || '未设置'
  }
  if (Array.isArray(value)) return value.map((item) => relayValue('', item)).filter(Boolean).join('、') || '未设置'
  if (typeof value === 'object') {
    return Object.keys(value).map((key) => relayValue(key, value[key])).filter(Boolean).join('、') || '未设置'
  }
  return String(value)
}

function relayTextFromPreview(preview) {
  const fields = Array.isArray(preview && preview.changed_fields) ? preview.changed_fields : []
  const after = preview && preview.after && typeof preview.after === 'object' ? preview.after : {}
  const changes = fields.map((field) => {
    const label = RELAY_FIELD_LABELS[field] || '约会安排'
    return `${label}调整为“${relayValue(field, after[field])}”`
  }).filter(Boolean)
  if (!changes.length) return '对方更新了约会安排，请查看最新共同方案。'
  return `对方想把${changes.join('，')}。其他安排保持不变，请告诉我是否可以。`.slice(0, 240)
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
    requires_partner_response: dimensions.some((item) => ['time', 'area', 'activity', 'budget', 'payment', 'duration'].includes(item)),
    relay_text: relayTextFromPreview(preview)
  }
}

module.exports = {
  PATCH_TOOL,
  PATCHABLE_FIELDS,
  previewApplicationChange,
  shareableSummary,
  relayTextFromPreview,
  cleanChanges,
  normalizePartnerRequest
}
