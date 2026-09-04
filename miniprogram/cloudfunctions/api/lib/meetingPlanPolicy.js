const {
  PLAN_CONTRACT_VERSION: DATE_PLAN_SCHEMA_VERSION,
  PERIOD_LABELS,
  normalizeStartTime,
  exactTimeFromText,
  periodForStartTime,
  venueResolution,
  activityVenueConflict,
  buildDatePlanV3,
  validateDatePlan
} = require('./datePlanContract')
const { attachPublicError } = require('./businessError')

// Persisted application docs remain on contract_version 2; DatePlanV3 is the
// canonical cross-runtime view (API + LangGraph) produced by datePlanContract.
const PLAN_CONTRACT_VERSION = 2

function text(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function containsPrivateContact(value) {
  const raw = String(value || '')
  return /(?:微信|vx|v信|手机号|电话|联系我|加我|QQ|邮箱|身份证|住址)/i.test(raw)
    || /(?:公司|单位|学校|大学|学院|小区|宿舍|办公室|写字楼|楼栋|单元|房间|姓名|我叫|账号|抖音|微博)/i.test(raw)
    || /\d|@/.test(raw)
}

function normalizeArrivalHint(value) {
  const normalized = text(value, 60)
  if (containsPrivateContact(normalized)) {
    const error = new Error('到场识别提示只能填写穿搭颜色或手持物，不能包含身份、单位、住址、账号或数字')
    throw attachPublicError(error, 'UNSAFE_ARRIVAL_HINT')
  }
  if (normalized && !/(?:红|橙|黄|绿|蓝|紫|黑|白|灰|棕|粉|衣|衫|外套|裤|裙|鞋|帽|包|眼镜|书|花|伞|杯|手持|拿着|背着)/.test(normalized)) {
    const error = new Error('到场识别提示请只描述穿搭颜色或手持物')
    throw attachPublicError(error, 'UNSAFE_ARRIVAL_HINT')
  }
  return normalized
}

function normalizeArrivalPosition(value) {
  const normalized = text(value, 40)
  if (!normalized) return ''
  if (containsPrivateContact(normalized)) {
    const error = new Error('现场位置只能填写公共场所内的可见位置，不能包含身份、单位、住址、账号或数字')
    throw attachPublicError(error, 'UNSAFE_ARRIVAL_POSITION')
  }
  if (!/(?:吧台|靠窗|窗边|门口|入口|出口|前台|取票机|收银台|大厅|等候区|服务台|招牌|电梯|扶梯|楼梯|立柱|柜台|座位|桌|角落|旁边|附近)/.test(normalized)) {
    const error = new Error('请描述公共场所内容易找到的位置，例如“吧台旁”或“靠窗座位”')
    throw attachPublicError(error, 'UNSAFE_ARRIVAL_POSITION')
  }
  return normalized
}

function normalizeMeetingPlanFields(input = {}) {
  const startTime = normalizeStartTime(input.start_time || input.startTime)
  const inferredPeriod = periodForStartTime(startTime)
  return {
    contract_version: Number(input.contract_version || input.contractVersion || 0),
    start_time: startTime,
    period: inferredPeriod || text(input.period, 20),
    activity_venue: text(input.activity_venue || input.activityVenue, 80),
    meet_point: text(input.meet_point || input.meetPoint, 80),
    arrival_hint: normalizeArrivalHint(input.arrival_hint || input.arrivalHint)
  }
}

function planReadiness(input = {}, options = {}) {
  const normalized = normalizeMeetingPlanFields(input)
  const activity = input.activity || (Array.isArray(input.activities) ? input.activities[0] : '')
  const staged = validateDatePlan({
    ...input,
    ...normalized,
    activity,
    activity_venue: normalized.activity_venue
  }, options.stage || 'final')
  return {
    ready: staged.valid,
    missing_fields: staged.missing.filter((field) => field === 'start_time' || field === 'activity_venue'),
    conflict: staged.conflicts[0] || null,
    fields: normalized,
    venue_resolution: staged.venue_resolution
  }
}

function formatPlanTime(date, period, startTime) {
  const day = text(date, 10)
  const exact = normalizeStartTime(startTime)
  const label = PERIOD_LABELS[period] || text(period, 20)
  return [day, exact || label].filter(Boolean).join(' ')
}

module.exports = {
  PLAN_CONTRACT_VERSION,
  DATE_PLAN_SCHEMA_VERSION,
  PERIOD_LABELS,
  normalizeStartTime,
  exactTimeFromText,
  periodForStartTime,
  normalizeArrivalHint,
  normalizeArrivalPosition,
  normalizeMeetingPlanFields,
  venueResolution,
  activityVenueConflict,
  planReadiness,
  formatPlanTime,
  buildDatePlanV3,
  validateDatePlan
}
