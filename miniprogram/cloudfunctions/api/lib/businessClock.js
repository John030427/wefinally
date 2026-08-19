const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function cycleLabelFromWeekday(weekday) {
  if (weekday === 3) return 'WED'
  if (weekday === 5) return 'FRI'
  return ''
}

function part(parts, type) {
  const item = parts.find((row) => row.type === type)
  return item ? item.value : ''
}

function shanghaiBusinessClock(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const businessDate = `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`
  const weekday = WEEKDAY[part(parts, 'weekday')]
  const isMatchDay = weekday === 3 || weekday === 5
  const cycleLabel = cycleLabelFromWeekday(weekday)
  const matchCycleId = isMatchDay ? `${businessDate}-${cycleLabel}` : ''
  return {
    businessDate,
    weekday,
    isMatchDay,
    matchType: weekday === 3 ? '周三' : (weekday === 5 ? '周五' : ''),
    matchCycleId,
    batchKey: matchCycleId ? `formal:${matchCycleId}` : `formal:${businessDate}`
  }
}

function formalBatchKey(businessDate, cycleLabel) {
  if (cycleLabel) return `formal:${businessDate}-${cycleLabel}`
  return `formal:${businessDate}`
}

module.exports = { shanghaiBusinessClock, formalBatchKey, cycleLabelFromWeekday }
