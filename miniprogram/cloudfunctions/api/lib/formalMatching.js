const { rankCandidates, scoreDetailFor } = require('./matchPolicy')
const { memberStatus, MEMBER_STATUS } = require('./memberPolicy')
const { isVipActive } = require('./format')
const { canEnterFormalCandidatePool } = require('./testIdentityPolicy')
const { canonicalPairKey, deliverPair, createCloudClaimStore, CLAIM_STATUS } = require('./matchClaim')

async function executeFormalMatching(ctx = {}) {
  const deps = ctx.deps || {}
  const clock = ctx.clock || {}
  if (typeof deps.list !== 'function') {
    return { matched_count: 0, users_considered: 0, candidates_evaluated: 0 }
  }
  const users = (await deps.list('user', { status: 1 }, 500) || [])
    .filter((row) => canEnterFormalCandidatePool(row))
    .filter((row) => memberStatus(row) === MEMBER_STATUS.APPROVED)
    .filter((row) => isVipActive(row))
  const claims = await deps.list('match_claim', { status: CLAIM_STATUS }, 500)
  const claimed = new Set()
  ;(claims || []).forEach((row) => {
    claimed.add(Number(row.user_id))
    claimed.add(Number(row.match_user_id))
  })
  const pool = users.filter((row) => !claimed.has(Number(row.id)))
  const settings = await deps.list('user_match_setting', {}, 500)
  const settingsByUserId = {}
  ;(settings || []).forEach((row) => {
    settingsByUserId[String(row.user_id)] = row
  })
  let matchedCount = 0
  let evaluated = 0
  const remaining = pool.slice()
  const claimStore = typeof deps.claimStore === 'function' ? deps.claimStore() : createCloudClaimStore()
  while (remaining.length >= 2) {
    const user = remaining.shift()
    const ranked = rankCandidates(user, remaining, settingsByUserId, { blockedIds: claimed })
    evaluated += ranked.length
    const best = ranked.find((item) => item.quality && item.quality.pass)
    if (!best) continue
    const partner = best.candidate
    const requestId = `formal:${clock.businessDate}:${user.id}:${partner.id}`
    const pairKey = canonicalPairKey(user.id, partner.id)
    const logA = await deps.addWithId('user_match_log', {
      user_id: user.id,
      match_user_id: partner.id,
      view_similarity: best.viewSimilarity,
      total_score: best.scoreA.total,
      score_detail_json: JSON.stringify(scoreDetailFor(best, 'a', ranked.indexOf(best) + 1)),
      score_version: 'algo_evidence_v2',
      match_date: clock.businessDate,
      match_type: clock.matchType || '正式匹配',
      pair_key: pairKey
    }, 'match_log')
    const logB = await deps.addWithId('user_match_log', {
      user_id: partner.id,
      match_user_id: user.id,
      view_similarity: best.viewSimilarity,
      total_score: best.scoreB.total,
      score_detail_json: JSON.stringify(scoreDetailFor(best, 'b', ranked.indexOf(best) + 1)),
      score_version: 'algo_evidence_v2',
      match_date: clock.businessDate,
      match_type: clock.matchType || '正式匹配',
      pair_key: pairKey
    }, 'match_log')
    const audit = await deps.addWithId('match_claim_audit', {
      request_id: requestId,
      pair_key: pairKey,
      user_id: user.id,
      match_user_id: partner.id,
      status: 'matched',
      action: 'formal_batch'
    }, 'match_audit')
    const delivery = await deliverPair({
      userId: user.id,
      partnerId: partner.id,
      requestId,
      logA,
      logB,
      audit,
      userDoc: user,
      partnerDoc: partner,
      userPatch: { match_status: 'matched', matched_partner_id: partner.id },
      partnerPatch: { match_status: 'matched', matched_partner_id: user.id }
    }, claimStore)
    if (!delivery.delivered) continue
    matchedCount += 1
    claimed.add(Number(user.id))
    claimed.add(Number(partner.id))
    const idx = remaining.findIndex((row) => Number(row.id) === Number(partner.id))
    if (idx >= 0) remaining.splice(idx, 1)
  }
  return {
    matched_count: matchedCount,
    users_considered: users.length,
    candidates_evaluated: evaluated
  }
}

module.exports = { executeFormalMatching }
