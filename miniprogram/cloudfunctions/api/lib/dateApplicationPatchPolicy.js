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
  share_message: 'share_message'
})

function classifyChangeIntent(message) {
  const text = String(message || '').trim()
  if (!text) return 'consultation'
  if (/[？?]|怎么选|是什么|有什么区别|能不能介绍/.test(text)) return 'consultation'
  const action = /改成|改为|换成|换到|调整为|取消|不要|不想|加上|增加|删除|移除|帮我改|请改/.test(text)
  const field = /周[一二三四五六日天]|预算|元|电影|咖啡|散步|吃饭|奶茶|看展|桌游|区域|地点|时间|上午|下午|晚上|AA|请客|时长/.test(text)
  if (action && field) return 'modify_date_application'
  return 'preference'
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

function createPatchFromDecision(currentApplication, decision) {
  if (!decision || decision.intent !== 'modify_date_application') throw new Error('当前表达不是明确办理请求')
  const request = decision.tool_request || decision.toolRequest || {}
  if (request.tool !== PATCH_TOOL) throw new Error('工具不在允许列表中')
  const changes = cleanChanges(request.arguments || {})
  const merged = Object.assign({}, currentApplication || {}, changes)
  normalizeApplication(merged, new Date())
  return { tool: PATCH_TOOL, changes }
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
  classifyChangeIntent,
  createPatchFromDecision,
  previewApplicationChange,
  shareableSummary,
  cleanChanges
}
