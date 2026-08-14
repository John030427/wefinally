const { rankCandidates, scoreDetailFor } = require('./matchPolicy')
const { memberStatus, MEMBER_STATUS } = require('./memberPolicy')
const { isVipActive } = require('./format')
const { canEnterFormalCandidatePool } = require('./testIdentityPolicy')
const { canonicalPairKey, deliverPair, createCloudClaimStore, CLAIM_STATUS } = require('./matchClaim')
const { semanticRerank, intentMatchGate } = require('./semanticMatchService')

function semanticDetail(best, side, rank) {
  return Object.assign(scoreDetailFor(best, side, rank), {
    ai_rank: best.ai_rank || null,
    ai_weight: best.ai_weight || 0,
    semantic_score: best.semantic_score || null,
    a_to_b_semantic_score: best.a_to_b_semantic_score || null,
    b_to_a_semantic_score: best.b_to_a_semantic_score || null,
    mutual_semantic_score: best.mutual_semantic_score || null,
    semantic_strengths: best.semantic_strengths || [],
    semantic_confidence: best.semantic_confidence || null,
    data_completeness: best.data_completeness || null,
    asymmetric_risks: best.asymmetric_risks || [],
    confirmation_questions: best.confirmation_questions || []
  })
}

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
  const settings = await deps.list('user_match_setting', {}, 500)
  const settingsByUserId = {}
  ;(settings || []).forEach((row) => {
    settingsByUserId[String(row.user_id)] = row
  })
  const pool = users
    .filter((row) => !claimed.has(Number(row.id)))
    .filter((row) => !intentMatchGate(settingsByUserId[String(row.id)]))
  let matchedCount = 0
  let evaluated = 0
  const remaining = pool.slice()
  const deliver = typeof deps.deliverPair === 'function' ? deps.deliverPair : deliverPair
  const claimStore = typeof deps.claimStore === 'function' ? deps.claimStore() : (deps.deliverPair ? null : createCloudClaimStore())
  const rerank = typeof deps.semanticRerank === 'function' ? deps.semanticRerank : semanticRerank
  while (remaining.length >= 2) {
    const user = remaining.shift()
    const ranked = rankCandidates(user, remaining, settingsByUserId, { blockedIds: claimed })
    evaluated += ranked.length
    const reranked = await rerank(ranked, user, settingsByUserId)
    const best = reranked.ranked.find((item) => item.quality && item.quality.pass)
    if (!best) continue
    const partner = best.candidate
    const requestId = `formal:${clock.businessDate}:${user.id}:${partner.id}`
    const pairKey = canonicalPairKey(user.id, partner.id)
    const deliveryData = {
      logA: {
        user_id: user.id,
        match_user_id: partner.id,
        view_similarity: best.viewSimilarity,
        total_score: best.scoreA.total,
        score_detail_json: JSON.stringify(semanticDetail(best, 'a', reranked.ranked.indexOf(best) + 1)),
        score_version: 'algo_evidence_v3',
        match_date: clock.businessDate,
        match_type: clock.matchType || '正式匹配',
        pair_key: pairKey
      },
      logB: {
        user_id: partner.id,
        match_user_id: user.id,
        view_similarity: best.viewSimilarity,
        total_score: best.scoreB.total,
        score_detail_json: JSON.stringify(semanticDetail(best, 'b', reranked.ranked.indexOf(best) + 1)),
        score_version: 'algo_evidence_v3',
        match_date: clock.businessDate,
        match_type: clock.matchType || '正式匹配',
        pair_key: pairKey
      },
      audit: {
        request_id: requestId,
        pair_key: pairKey,
        user_id: user.id,
        match_user_id: partner.id,
        status: 'matched',
        action: 'formal_batch'
      }
    }
    const delivery = await deliver({
      userId: user.id,
      partnerId: partner.id,
      requestId,
      deliveryData,
      userDoc: user,
      partnerDoc: partner,
      userPatch: { match_status: 'matched', matched_partner_id: partner.id },
      partnerPatch: { match_status: 'matched', matched_partner_id: user.id }
    }, claimStore)
    if (!delivery.delivered) continue
    if (typeof deps.ensureReportTask === 'function' && delivery.logA) {
      await deps.ensureReportTask(delivery.logA, 'auto').catch(() => null)
    }
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
