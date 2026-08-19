const { shanghaiBusinessClock, cycleLabelFromWeekday } = require('./businessClock')

const PRODUCTION_CYCLE_RE = /^\d{4}-\d{2}-\d{2}-(WED|FRI)$/

function resolveProductionMatchCycle(now = new Date()) {
  const clock = shanghaiBusinessClock(now)
  const label = cycleLabelFromWeekday(clock.weekday)
  const matchCycleId = clock.isMatchDay ? `${clock.businessDate}-${label}` : ''
  return Object.assign({}, clock, {
    matchCycleId,
    batchKey: matchCycleId ? `formal:${matchCycleId}` : clock.batchKey,
    cycleKind: 'production'
  })
}

function buildQaMatchCycle(userId, now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : Date.now()
  const matchCycleId = `QA:${userId}:${timestamp}`
  const slug = matchCycleId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return {
    matchCycleId,
    batchKey: `qa:${slug}`,
    cycleKind: 'qa',
    isTest: true,
    qaCycle: true,
    businessDate: shanghaiBusinessClock(now).businessDate,
    matchType: 'AI测试匹配'
  }
}

function isProductionClaim(row) {
  if (!row) return false
  if (Number(row.qa_cycle || 0) === 1) return false
  if (String(row.match_cycle_id || '').startsWith('QA:')) return false
  if (Number(row.is_test || 0) === 1 && !PRODUCTION_CYCLE_RE.test(String(row.match_cycle_id || ''))) return false
  return true
}

function isClaimInCycle(row, cycleId) {
  if (!row || !cycleId) return false
  return String(row.match_cycle_id || '') === String(cycleId)
}

function indexClaimsForMatching(claims, productionCycleId) {
  const cycleClaimed = new Set()
  const historicalPairKeys = new Set()
  for (const row of claims || []) {
    if (row.pair_key) historicalPairKeys.add(String(row.pair_key))
    if (!isProductionClaim(row)) continue
    if (productionCycleId && isClaimInCycle(row, productionCycleId)) {
      cycleClaimed.add(Number(row.user_id))
      cycleClaimed.add(Number(row.match_user_id))
    }
  }
  return { cycleClaimed, historicalPairKeys }
}

function userHasProductionClaimInCycle(userId, claims, cycleId) {
  return (claims || []).some((row) => isProductionClaim(row)
    && isClaimInCycle(row, cycleId)
    && (Number(row.user_id) === Number(userId) || Number(row.match_user_id) === Number(userId)))
}

function dryRunProductionCycle(simulatedNow = new Date()) {
  const cycle = resolveProductionMatchCycle(simulatedNow)
  return {
    dry_run: true,
    match_cycle_id: cycle.matchCycleId,
    business_date: cycle.businessDate,
    match_type: cycle.matchType,
    batch_key: cycle.batchKey,
    is_match_day: cycle.isMatchDay,
    weekday: cycle.weekday
  }
}

function formalBatchDocumentId(matchCycleId) {
  return `match_batch_formal_${String(matchCycleId || '').replace(/[^a-zA-Z0-9]/g, '')}`
}

module.exports = {
  PRODUCTION_CYCLE_RE,
  resolveProductionMatchCycle,
  buildQaMatchCycle,
  isProductionClaim,
  isClaimInCycle,
  indexClaimsForMatching,
  userHasProductionClaimInCycle,
  dryRunProductionCycle,
  formalBatchDocumentId
}
