const PLAN_CONTRACT_VERSION = 2
const { attachPublicError } = require('./businessError')

const PERIOD_LABELS = Object.freeze({
  morning: '上午',
  afternoon: '下午',
  evening: '傍晚',
  night: '晚上'
})

const ACTIVITY_VENUE_RULES = Object.freeze({
  '电影': /电影院|影城|影院|cinema|movie/i,
  '咖啡': /咖啡|星巴克|coffee|cafe|café/i,
  '奶茶': /奶茶|茶饮|tea/i,
  '吃饭': /餐厅|饭店|餐馆|restaurant|food/i,
  '看展': /展馆|展览|美术馆|博物馆|gallery|museum/i,
  '桌游': /桌游|board\s*game/i
})

const ACTIVITY_DETAIL_RULES = Object.freeze({
  '吃饭': /^(?:吃饭|椰子鸡|火锅|烤肉|烧烤|粤菜|川菜|湘菜|日料|西餐|披萨|牛排|海鲜|茶餐厅)$/,
  '咖啡': /^(?:咖啡|手冲|拿铁|美式)$/,
  '奶茶': /^(?:奶茶|茶饮)$/,
  '电影': /^(?:电影|看电影)$/,
  '看展': /^(?:看展|展览)$/,
  '桌游': /^(?:桌游)$/
})

const CONCRETE_VENUE_RULE = /(?:店|餐厅|饭店|餐馆|影城|影院|电影院|美术馆|博物馆|展馆|桌游馆)$/
const AREA_HINT_RULE = /(?:附近|商圈|中心|广场|街区|片区|新区|区)$/

function text(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function normalizeStartTime(value) {
  const raw = text(value, 8)
  const matched = raw.match(/^(\d{1,2}):([0-5]\d)$/)
  if (!matched) return ''
  const hour = Number(matched[1])
  if (hour > 23) return ''
  return `${String(hour).padStart(2, '0')}:${matched[2]}`
}

function exactTimeFromText(value, options = {}) {
  const raw = text(value, 200)
  const matched = raw.match(/(?:(上午|中午|下午|傍晚|晚上|夜里)\s*)?(?<!\d)(\d{1,2})(?:点|:)(?:\s*(\d{1,2})分?)?/)
  if (!matched) return ''
  let hour = Number(matched[2])
  const minute = Number(matched[3] || 0)
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return ''
  const prefix = matched[1] || ''
  const period = String(options.period || '')
  if (/下午|傍晚|晚上|夜里/.test(prefix) && hour < 12) hour += 12
  else if (!prefix && (period === 'afternoon' || period === 'evening' || period === 'night') && hour < 12) {
    hour += 12
  }
  return normalizeStartTime(`${hour}:${String(minute).padStart(2, '0')}`)
}

function periodForStartTime(value) {
  const normalized = normalizeStartTime(value)
  if (!normalized) return ''
  const hour = Number(normalized.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 19) return 'evening'
  return 'night'
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

function venueResolution(activity, input) {
  const normalizedActivity = text(activity, 20)
  const value = text(input, 80)
  const unresolved = (areaHint, activityDetail) => ({
    status: 'needs_specific_venue',
    area_hint: areaHint,
    activity_detail: activityDetail,
    activity_venue: '',
    missing_fields: ['activity_venue']
  })
  if (!value) return unresolved('', normalizedActivity)
  if (CONCRETE_VENUE_RULE.test(value)) {
    return {
      status: 'resolved',
      area_hint: '',
      activity_detail: normalizedActivity,
      activity_venue: value,
      missing_fields: []
    }
  }
  const detailRule = ACTIVITY_DETAIL_RULES[normalizedActivity]
  if (detailRule && detailRule.test(value)) return unresolved('', value)
  if (AREA_HINT_RULE.test(value)) return unresolved(value, normalizedActivity)
  return unresolved(value, normalizedActivity)
}

function activityVenueConflict(activity, activityVenue) {
  const normalizedActivity = text(activity, 20)
  const normalizedVenue = text(activityVenue, 80)
  if (!normalizedActivity || !normalizedVenue) return null
  const rule = ACTIVITY_VENUE_RULES[normalizedActivity]
  if (!rule || rule.test(normalizedVenue)) return null
  return {
    code: 'ACTIVITY_VENUE_CONFLICT',
    activity: normalizedActivity,
    activity_venue: normalizedVenue,
    message: normalizedActivity === '电影'
      ? `你选择了看电影，但活动场地是“${normalizedVenue}”。请确认它是集合点，还是把活动场地改为具体电影院。`
      : `“${normalizedVenue}”看起来与“${normalizedActivity}”不一致，请确认活动场地或修改活动。`
  }
}

function planReadiness(input = {}, options = {}) {
  const normalized = normalizeMeetingPlanFields(input)
  const missing = []
  if (!normalized.start_time) missing.push('start_time')
  const activity = input.activity || (Array.isArray(input.activities) ? input.activities[0] : '')
  const resolution = input.venue_resolution && typeof input.venue_resolution === 'object'
    ? input.venue_resolution
    : venueResolution(activity, normalized.activity_venue)
  if (resolution.status !== 'resolved') missing.push('activity_venue')
  const conflict = resolution.status === 'resolved'
    ? activityVenueConflict(activity, resolution.activity_venue)
    : null
  return {
    ready: missing.length === 0 && !conflict,
    missing_fields: missing,
    conflict,
    fields: normalized,
    venue_resolution: resolution
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
  formatPlanTime
}
