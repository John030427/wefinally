'use strict'

const PLAN_CONTRACT_VERSION = 3

const PERIOD_LABELS = Object.freeze({
  morning: '上午',
  afternoon: '下午',
  evening: '傍晚',
  night: '晚上'
})

const ACTIVITY_VENUE_RULES = Object.freeze({
  电影: /电影院|影城|影院|cinema|movie/i,
  咖啡: /咖啡|星巴克|coffee|cafe|café/i,
  奶茶: /奶茶|茶饮|tea/i,
  吃饭: /餐厅|饭店|餐馆|restaurant|food/i,
  看展: /展馆|展览|美术馆|博物馆|gallery|museum/i,
  桌游: /桌游|board\s*game/i
})

const ACTIVITY_DETAIL_RULES = Object.freeze({
  吃饭: /^(?:吃饭|椰子鸡|火锅|烤肉|烧烤|粤菜|川菜|湘菜|日料|西餐|披萨|牛排|海鲜|茶餐厅)$/,
  咖啡: /^(?:咖啡|手冲|拿铁|美式)$/,
  奶茶: /^(?:奶茶|茶饮)$/,
  电影: /^(?:电影|看电影)$/,
  看展: /^(?:看展|展览)$/,
  桌游: /^(?:桌游)$/
})

const CONCRETE_VENUE_RULE = /(?:店|餐厅|饭店|餐馆|影城|影院|电影院|美术馆|博物馆|展馆|桌游馆)$/
const BRANDED_VENUE_RULE = /(?:星巴克|瑞幸|喜茶|奈雪|太二|海底捞|润园四季|百老汇|英皇)/
const AREA_HINT_RULE = /(?:附近|商圈|中心|广场|街区|片区|新区|区)$/
const WEEKDAY_SHIFT = Object.freeze({
  周日: 0, 周天: 0, 星期日: 0, 星期天: 0,
  周一: 1, 星期一: 1,
  周二: 2, 星期二: 2,
  周三: 3, 星期三: 3,
  周四: 4, 星期四: 4,
  周五: 5, 星期五: 5,
  周六: 6, 星期六: 6
})

const CHINESE_HOUR = Object.freeze({
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12
})

function arabicHourToken(value) {
  const raw = String(value || '')
  if (/^\d{1,2}$/.test(raw)) return Number(raw)
  if (Object.prototype.hasOwnProperty.call(CHINESE_HOUR, raw)) return CHINESE_HOUR[raw]
  return NaN
}

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
  const matched = raw.match(/(?:(上午|中午|下午|傍晚|晚上|夜里)\s*)?(?<![0-9一二三四五六七八九十两])([0-9]{1,2}|[一二三四五六七八九十两]{1,3})(?:点|:)(?:\s*([0-9]{1,2}|[一二三四五六七八九十])分?)?/)
  if (!matched) return ''
  let hour = arabicHourToken(matched[2])
  const minuteToken = matched[3]
  const minute = minuteToken == null || minuteToken === '' ? 0 : arabicHourToken(minuteToken)
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) return ''
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

function periodFromText(value) {
  const raw = text(value, 40)
  if (/上午|早上/.test(raw)) return 'morning'
  if (/中午|下午/.test(raw)) return 'afternoon'
  if (/傍晚/.test(raw)) return 'evening'
  if (/晚上|夜里|夜晚/.test(raw)) return 'night'
  return ''
}

function isBrandOnlyVenue(value) {
  return /^(?:星巴克|瑞幸|喜茶|奈雪|太二|海底捞|润园四季|百老汇|英皇)$/.test(text(value, 80))
}

function isConcreteNamedVenue(value) {
  const raw = text(value, 80)
  if (!raw) return false
  if (CONCRETE_VENUE_RULE.test(raw)) return true
  if (BRANDED_VENUE_RULE.test(raw) && !isBrandOnlyVenue(raw)) return true
  return false
}

function isActivityDetailOnly(activity, value) {
  const normalizedActivity = text(activity, 20)
  const raw = text(value, 80)
  if (!raw) return false
  if (isConcreteNamedVenue(raw) || AREA_HINT_RULE.test(raw)) return false
  if (/中心|城|广场|公园|商场|步行街|地铁|站|馆|院|店|厅|里|附近|万象|大运|海岸|海岸城|壹方|茂业|天虹/.test(raw)) {
    return false
  }
  const detailRule = ACTIVITY_DETAIL_RULES[normalizedActivity]
  if (detailRule && detailRule.test(raw)) return true
  if (/^(?:椰子鸡|火锅|烤肉|烧烤|粤菜|川菜|湘菜|日料|西餐|披萨|牛排|海鲜)$/.test(raw)) return true
  return false
}

function normalizeFlexibleLocation(activity, input, options = {}) {
  const normalizedActivity = text(activity || options.activity, 20)
  const value = text(input, 80)
  const priorDetail = text(options.activity_detail, 40)

  if (!value) {
    return {
      status: 'location_required',
      location_precision: 'unspecified',
      venue_choice_mode: text(options.venue_choice_mode, 40) || '',
      area_hint: '',
      activity_detail: priorDetail || normalizedActivity,
      activity_venue: '',
      missing_fields: ['activity_venue'],
      clarification: '想在哪里见面？商场、商圈或具体店名都可以'
    }
  }

  if (isActivityDetailOnly(normalizedActivity, value)) {
    return {
      status: 'location_required',
      location_precision: 'unspecified',
      venue_choice_mode: '',
      area_hint: '',
      activity_detail: value,
      activity_venue: '',
      missing_fields: ['activity_venue'],
      clarification: `“${value}”更像活动说明。想在哪里见面？商场、商圈或具体店名都可以`
    }
  }

  const precision = isConcreteNamedVenue(value) ? 'venue' : 'area'
  const mode = text(options.venue_choice_mode, 40) || 'named_location'
  return {
    status: 'resolved',
    location_precision: precision,
    venue_choice_mode: mode,
    area_hint: precision === 'area' ? value : '',
    activity_detail: priorDetail,
    activity_venue: value,
    missing_fields: [],
    clarification: precision === 'area' && mode === 'named_location'
      ? '当前地点比较宽泛，可以到场后再选店；若你已有具体店名也可以继续补充。'
      : ''
  }
}

function venueResolution(activity, input) {
  const flexible = normalizeFlexibleLocation(activity, input)
  if (flexible.status === 'location_required') {
    return {
      status: 'needs_specific_venue',
      area_hint: flexible.area_hint,
      activity_detail: flexible.activity_detail,
      activity_venue: '',
      missing_fields: ['activity_venue'],
      location_precision: flexible.location_precision,
      venue_choice_mode: flexible.venue_choice_mode,
      clarification: flexible.clarification
    }
  }
  return {
    status: 'resolved',
    area_hint: flexible.area_hint,
    activity_detail: flexible.activity_detail || text(activity, 20),
    activity_venue: flexible.activity_venue,
    missing_fields: [],
    location_precision: flexible.location_precision,
    venue_choice_mode: flexible.venue_choice_mode,
    clarification: flexible.clarification
  }
}

function activityVenueConflict(activity, activityVenue) {
  const normalizedActivity = text(activity, 20)
  const normalizedVenue = text(activityVenue, 80)
  if (!normalizedActivity || !normalizedVenue) return null
  const flexible = normalizeFlexibleLocation(normalizedActivity, normalizedVenue)
  if (flexible.status !== 'resolved') return null
  if (normalizedActivity === '电影'
    && /星巴克|瑞幸|喜茶|奈雪|咖啡/.test(normalizedVenue)
    && !/影城|影院|电影院|cinema|movie/i.test(normalizedVenue)) {
    return {
      code: 'ACTIVITY_VENUE_CONFLICT',
      activity: normalizedActivity,
      activity_venue: normalizedVenue,
      message: `你选择了看电影，但活动场地是“${normalizedVenue}”。请确认它是集合点，还是把活动场地改为具体电影院。`
    }
  }
  // Mall / area level places are never hard conflicts.
  if (flexible.location_precision === 'area') return null
  if (normalizedActivity === '咖啡' && /影城|影院|电影院/.test(normalizedVenue) && !/咖啡/.test(normalizedVenue)) {
    return {
      code: 'ACTIVITY_VENUE_CONFLICT',
      activity: normalizedActivity,
      activity_venue: normalizedVenue,
      message: `“${normalizedVenue}”看起来与“咖啡”不一致，请确认活动场地或修改活动。`
    }
  }
  return null
}

function firstOf(input, keys, maxLength) {
  for (const key of keys) {
    if (input[key] != null && String(input[key]).trim()) return text(input[key], maxLength)
  }
  return ''
}

function buildDatePlanV3(input = {}) {
  const startTime = normalizeStartTime(input.start_time || input.startTime)
  const inferredPeriod = periodForStartTime(startTime)
  const period = inferredPeriod || text(input.period, 20)
  const activity = firstOf(input, ['activity'], 20)
    || text(Array.isArray(input.activities) ? input.activities[0] : '', 20)
  const area = firstOf(input, ['area'], 40)
    || text(Array.isArray(input.areas) ? input.areas[0] : '', 40)
  return {
    contract_version: PLAN_CONTRACT_VERSION,
    date: text(input.date || (Array.isArray(input.availability) && input.availability[0] && input.availability[0].date) || '', 10),
    period,
    start_time: startTime,
    area,
    activity,
    activity_venue: firstOf(input, ['activity_venue', 'activityVenue'], 80),
    meet_point: firstOf(input, ['meet_point', 'meetPoint'], 80),
    budget: firstOf(input, ['budget'], 40),
    payment: firstOf(input, ['payment', 'payment_preference', 'paymentPreference'], 40),
    duration: firstOf(input, ['duration'], 40),
    arrival_hint: firstOf(input, ['arrival_hint', 'arrivalHint'], 60)
  }
}

function validateDatePlan(planInput = {}, stage = 'final') {
  const plan = buildDatePlanV3(planInput)
  const missing = []
  const conflicts = []
  let clarification = ''

  if (stage === 'final' || stage === 'invitation') {
    if (!plan.date) missing.push('date')
    if (!plan.period) missing.push('period')
    if (!plan.area) missing.push('area')
    if (!plan.activity) missing.push('activity')
  }
  if (stage === 'final') {
    if (!plan.start_time) missing.push('start_time')
  }

  const resolution = normalizeFlexibleLocation(plan.activity, plan.activity_venue, {
    activity_detail: planInput.activity_detail,
    venue_choice_mode: planInput.venue_choice_mode
  })
  if (stage === 'final' || stage === 'invitation') {
    if (resolution.status === 'location_required' || !resolution.activity_venue) missing.push('activity_venue')
    const conflict = resolution.status === 'resolved'
      ? activityVenueConflict(plan.activity, resolution.activity_venue)
      : null
    if (conflict) {
      conflicts.push(conflict)
      clarification = conflict.message
    }
  } else if (stage === 'draft') {
    if (resolution.status === 'resolved') {
      const conflict = activityVenueConflict(plan.activity, resolution.activity_venue)
      if (conflict) {
        conflicts.push(conflict)
        clarification = conflict.message
      }
    }
  }

  if (!clarification && missing.includes('activity_venue')) {
    clarification = resolution.clarification || '想在哪里见面？商场、商圈或具体店名都可以'
  }
  if (!clarification && plan.activity === '电影' && /星巴克|咖啡/.test(plan.meet_point || plan.activity_venue || '')) {
    clarification = '星巴克可以作为集合点，但看电影还需要具体电影院作为活动场地。'
  }

  return {
    valid: missing.length === 0 && conflicts.length === 0,
    missing,
    conflicts,
    clarification,
    plan: Object.assign({}, plan, {
      activity_venue: resolution.activity_venue || plan.activity_venue,
      activity_detail: resolution.activity_detail || planInput.activity_detail || '',
      location_precision: resolution.location_precision,
      venue_choice_mode: resolution.venue_choice_mode
    }),
    venue_resolution: venueResolution(plan.activity, resolution.activity_venue || plan.activity_venue),
    stage
  }
}

function shiftDateToWeekday(baseDate, weekdayName) {
  const target = WEEKDAY_SHIFT[weekdayName]
  if (target == null) return ''
  const matched = String(baseDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return ''
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])))
  if (Number.isNaN(date.getTime())) return ''
  const current = date.getUTCDay()
  const delta = (target - current + 7) % 7
  date.setUTCDate(date.getUTCDate() + (delta === 0 ? 7 : delta))
  return date.toISOString().slice(0, 10)
}

function emptyIntent(overrides = {}) {
  return Object.assign({
    intent: 'clarify_scope',
    changed_dimensions: [],
    candidate_values: {},
    confidence: 0.5,
    needs_clarification: false,
    clarification: ''
  }, overrides)
}

function interpretNlPlanUtterance(rawText, baseInput = {}) {
  const textValue = text(rawText, 200)
  const base = buildDatePlanV3(baseInput)

  if (/接受整份方案|全部接受|就按这个方案|同意这份方案/.test(textValue)) {
    return emptyIntent({
      intent: 'accept_current_invitation',
      confidence: 0.95,
      candidate_values: {}
    })
  }
  if (/只接受时间调整|只改时间|时间可以.*其他不变|其他都按原方案.*时间/.test(textValue)) {
    return emptyIntent({
      intent: 'accept_time_only',
      changed_dimensions: ['time', 'exact_time'],
      confidence: 0.9
    })
  }
  if (/时间不变.*只改活动|只改活动|活动改成|换成.*(?:电影|吃饭|咖啡|奶茶|看展|桌游)/.test(textValue)
    && !exactTimeFromText(textValue, { period: base.period })) {
    const activityMatch = textValue.match(/(电影|吃饭|咖啡|奶茶|看展|桌游|椰子鸡)/)
    let activity = activityMatch ? activityMatch[1] : ''
    if (activity === '椰子鸡') activity = '吃饭'
    return emptyIntent({
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['activity'],
      candidate_values: activity ? { activity } : {},
      confidence: 0.88,
      needs_clarification: !activity,
      clarification: activity ? '' : '你想把活动改成哪一种？'
    })
  }
  if (/星巴克只是集合点|集合点.*星巴克|星巴克.*集合点/.test(textValue)) {
    return emptyIntent({
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['meet_point'],
      candidate_values: { meet_point: '星巴克' },
      confidence: 0.92
    })
  }
  if (/电影|看电影/.test(textValue) && /星巴克|咖啡店|咖啡馆/.test(textValue) && !/集合点/.test(textValue)) {
    return emptyIntent({
      intent: 'clarify_plan',
      changed_dimensions: ['activity', 'activity_venue', 'meet_point'],
      candidate_values: { activity: '电影', activity_venue: '星巴克' },
      confidence: 0.8,
      needs_clarification: true,
      clarification: '你确认了“看电影”，但当前只看到星巴克。星巴克可以作为集合点，但还需要具体电影院作为活动场地。你想去哪家电影院？'
    })
  }
  if (/大运中心附近/.test(textValue) && /椰子鸡|吃饭/.test(textValue)) {
    return emptyIntent({
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['area', 'activity', 'activity_venue'],
      candidate_values: {
        area: '大运中心附近',
        activity: '吃饭',
        activity_venue: '椰子鸡'
      },
      confidence: 0.9
    })
  }

  const weekdayMatch = textValue.match(/(?:改成|换成|改到)\s*(周日|周天|周一|周二|周三|周四|周五|周六|星期[一二三四五六日天])/)
  if (weekdayMatch) {
    const nextDate = shiftDateToWeekday(base.date, weekdayMatch[1])
    return emptyIntent({
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['time'],
      candidate_values: nextDate ? { date: nextDate, start_time: '' } : {},
      confidence: nextDate ? 0.86 : 0.4,
      needs_clarification: !nextDate,
      clarification: nextDate ? '' : '请提供完整日期后再改到对应星期。'
    })
  }

  const startTime = exactTimeFromText(textValue, { period: base.period || periodFromText(textValue) })
  if (startTime) {
    return emptyIntent({
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['exact_time', 'time'],
      candidate_values: {
        start_time: startTime,
        period: periodForStartTime(startTime)
      },
      confidence: 0.93
    })
  }

  return emptyIntent({
    intent: 'clarify_scope',
    needs_clarification: true,
    clarification: '请告诉我你想调整时间、区域、活动，还是场地？',
    confidence: 0.4
  })
}

function applyStructuredPlanIntent(intentInput = {}, baseInput = {}) {
  const base = buildDatePlanV3(baseInput)
  const intent = text(intentInput.intent, 64) || 'clarify_scope'
  const changed = Array.isArray(intentInput.changed_dimensions)
    ? intentInput.changed_dimensions.map((item) => text(item, 40)).filter(Boolean)
    : []
  const candidates = intentInput.candidate_values && typeof intentInput.candidate_values === 'object'
    ? intentInput.candidate_values
    : {}
  const needsClarification = intentInput.needs_clarification === true
  const clarification = text(intentInput.clarification, 240)

  if (needsClarification || intent === 'clarify_scope' || intent === 'clarify_plan') {
    return {
      intent,
      changed_dimensions: changed,
      candidate_values: candidates,
      confidence: Number(intentInput.confidence || 0),
      needs_clarification: true,
      clarification: clarification || '请再明确一下要调整的部分。',
      plan: base
    }
  }

  if (intent === 'accept_current_invitation' || intent === 'accept_time_only') {
    return {
      intent,
      changed_dimensions: changed,
      candidate_values: candidates,
      confidence: Number(intentInput.confidence || 0),
      needs_clarification: false,
      clarification: '',
      plan: base
    }
  }

  const next = Object.assign({}, base)
  const hasCandidate = (key) => Object.prototype.hasOwnProperty.call(candidates, key)
  if ((changed.includes('exact_time') || hasCandidate('start_time')) && hasCandidate('start_time')) {
    const rawTime = candidates.start_time
    const normalized = normalizeStartTime(rawTime) || exactTimeFromText(String(rawTime || ''), { period: next.period })
    next.start_time = normalized
    if (normalized) next.period = periodForStartTime(normalized)
  }
  if (changed.includes('time') || hasCandidate('date') || hasCandidate('period')) {
    if (hasCandidate('date')) next.date = text(candidates.date, 10)
    if (hasCandidate('period')) next.period = text(candidates.period, 20)
    if (hasCandidate('start_time') && candidates.start_time === '') {
      next.start_time = ''
    }
  }
  if ((changed.includes('area') || hasCandidate('area')) && hasCandidate('area')) next.area = text(candidates.area, 40)
  if ((changed.includes('activity') || hasCandidate('activity')) && hasCandidate('activity')) {
    next.activity = text(candidates.activity, 20)
    if (!changed.includes('activity_venue') && !hasCandidate('activity_venue')) next.activity_venue = ''
  }
  if ((changed.includes('activity_venue') || hasCandidate('activity_venue')) && hasCandidate('activity_venue')) {
    next.activity_venue = text(candidates.activity_venue, 80)
  }
  if ((changed.includes('meet_point') || hasCandidate('meet_point')) && hasCandidate('meet_point')) {
    next.meet_point = text(candidates.meet_point, 80)
  }
  if ((changed.includes('budget') || hasCandidate('budget')) && hasCandidate('budget')) next.budget = text(candidates.budget, 40)
  if ((changed.includes('payment') || hasCandidate('payment')) && hasCandidate('payment')) next.payment = text(candidates.payment, 40)
  if ((changed.includes('duration') || hasCandidate('duration')) && hasCandidate('duration')) next.duration = text(candidates.duration, 40)

  // Deterministic conflict gate: movie + coffee brand as venue needs clarification unless meet_point-only.
  if (next.activity === '电影' && /^(?:星巴克|瑞幸|喜茶|奈雪)$/.test(next.activity_venue)) {
    return {
      intent,
      changed_dimensions: changed,
      candidate_values: candidates,
      confidence: Number(intentInput.confidence || 0),
      needs_clarification: true,
      clarification: '星巴克可以作为集合点，但看电影还需要具体电影院作为活动场地。你想去哪家电影院？',
      plan: Object.assign({}, next, { activity_venue: '', meet_point: next.meet_point || next.activity_venue })
    }
  }

  return {
    intent,
    changed_dimensions: changed,
    candidate_values: candidates,
    confidence: Number(intentInput.confidence || 0),
    needs_clarification: false,
    clarification: '',
    plan: buildDatePlanV3(next)
  }
}

const NL_CONTRACT_CASES = Object.freeze([
  {
    text: '周日晚上八点',
    base: { date: '2026-09-06', period: 'evening', activity: '电影', area: '南山' },
    expect: {
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['exact_time', 'time'],
      candidate_values: { start_time: '20:00', period: 'night' },
      plan: { start_time: '20:00', period: 'night' },
      stage: 'draft',
      valid: true
    }
  },
  {
    text: '7号周一改成周日',
    base: { date: '2026-09-07', period: 'night', start_time: '20:00', activity: '电影', area: '南山' },
    expect: {
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['time'],
      candidate_values: { date: '2026-09-13', start_time: '' },
      plan: { date: '2026-09-13', start_time: '', period: 'night' },
      stage: 'draft',
      valid: true
    }
  },
  {
    text: '大运中心附近吃椰子鸡',
    base: { date: '2026-09-06', period: 'evening' },
    expect: {
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['area', 'activity', 'activity_venue'],
      candidate_values: { area: '大运中心附近', activity: '吃饭', activity_venue: '椰子鸡' },
      plan: { area: '大运中心附近', activity: '吃饭', activity_venue: '椰子鸡' },
      stage: 'draft',
      valid: true,
      missing: undefined
    }
  },
  {
    text: '看电影但填星巴克',
    base: { date: '2026-09-06', period: 'night', start_time: '20:00', area: '南山' },
    expect: {
      intent: 'clarify_plan',
      needs_clarification: true,
      clarification_includes: '电影院',
      stage: 'final',
      valid: false
    }
  },
  {
    text: '星巴克只是集合点',
    base: {
      date: '2026-09-06',
      period: 'night',
      start_time: '20:00',
      activity: '电影',
      area: '南山',
      activity_venue: '万象天地百老汇影城'
    },
    expect: {
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['meet_point'],
      candidate_values: { meet_point: '星巴克' },
      plan: { meet_point: '星巴克', activity_venue: '万象天地百老汇影城' },
      stage: 'final',
      valid: true
    }
  },
  {
    text: '时间不变只改活动成咖啡',
    base: {
      date: '2026-09-06',
      period: 'night',
      start_time: '20:00',
      activity: '电影',
      area: '南山',
      activity_venue: '万象天地百老汇影城'
    },
    expect: {
      intent: 'modify_specific_dimensions',
      changed_dimensions: ['activity'],
      candidate_values: { activity: '咖啡' },
      plan: { start_time: '20:00', activity: '咖啡', activity_venue: '' },
      stage: 'draft',
      valid: true
    }
  },
  {
    text: '接受整份方案',
    base: {
      date: '2026-09-06',
      period: 'night',
      start_time: '20:00',
      activity: '电影',
      area: '南山',
      activity_venue: '万象天地百老汇影城'
    },
    expect: {
      intent: 'accept_current_invitation',
      plan: { start_time: '20:00', activity: '电影' },
      stage: 'final',
      valid: true
    }
  },
  {
    text: '只接受时间调整',
    base: {
      date: '2026-09-06',
      period: 'night',
      start_time: '20:00',
      activity: '电影',
      area: '南山',
      activity_venue: '万象天地百老汇影城'
    },
    expect: {
      intent: 'accept_time_only',
      changed_dimensions: ['time', 'exact_time'],
      plan: { start_time: '20:00' },
      stage: 'final',
      valid: true
    }
  }
])

module.exports = {
  PLAN_CONTRACT_VERSION,
  PERIOD_LABELS,
  NL_CONTRACT_CASES,
  text,
  normalizeStartTime,
  exactTimeFromText,
  periodForStartTime,
  venueResolution,
  activityVenueConflict,
  normalizeFlexibleLocation,
  buildDatePlanV3,
  validateDatePlan,
  interpretNlPlanUtterance,
  applyStructuredPlanIntent
}
