const { rankCandidates, scoreDetailFor } = require('./matchPolicy')
const { memberStatus, MEMBER_STATUS } = require('./memberPolicy')
const { isVipActive } = require('./format')
const { canEnterFormalCandidatePool } = require('./testIdentityPolicy')
const { canonicalPairKey, deliverPair, createCloudClaimStore, CLAIM_STATUS } = require('./matchClaim')
const { semanticRerank, intentMatchGate } = require('./semanticMatchService')
const { indexClaimsForMatching } = require('./matchCycleService')
const { sharesCandidateCohort } = require('./matchCohortPolicy')
const { qaRunKey, shouldExcludeHistoricalClaims } = require('./qaRegistrationReplayPolicy')
const { loadCorpusForUserIds } = require('./matchRagCorpus')

function loadRagCorpus(userIds) {
  // Lazily load CloudBase so pure formal-matching selfchecks can inject their
  // own reranker without requiring a cloud runtime during module load.
  const db = require('./db')
  return loadCorpusForUserIds(userIds, {
    listChunksByOwnerIds: db.listChunksByOwnerIds,
    now: db.now
  })
}

function semanticDetail(best, side, rank, reranked) {
  const detail = scoreDetailFor(best, side, rank)
  const canonical = Number(best && best.canonical_score)
  const finalMatchScore = Number.isFinite(canonical)
    ? Math.max(0, Math.min(100, Math.round(canonical)))
    : Number(detail.normalized_total || detail.normalizedTotal || 0)
  return Object.assign(detail, {
    base_normalized_total: Number(detail.normalized_total || detail.normalizedTotal || 0),
    final_match_score: finalMatchScore,
    canonical_score: finalMatchScore,
    normalized_total: finalMatchScore,
    normalizedTotal: finalMatchScore,
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
    confirmation_questions: best.confirmation_questions || [],
    semantic_strength_evidence_keys: best.semantic_strength_evidence_keys || [],
    semantic_risk_evidence_keys: best.semantic_risk_evidence_keys || [],
    semantic_missing_categories: best.semantic_missing_categories || [],
    bilateral_fit: best.bilateral_fit || null,
    bilateral_mutual_score: best.bilateral_fit ? Number(best.bilateral_fit.mutual_score || 0) : null,
    rag: reranked && reranked.rag ? Object.assign({}, reranked.rag) : null
  })
}

function isHistoricalPair(user, partner, historicalClaimsByPair) {
  try {
    const claims = historicalClaimsByPair.get(canonicalPairKey(user.id, partner.id)) || []
    return shouldExcludeHistoricalClaims(claims, user, partner)
  } catch (err) {
    return false
  }
}

async function executeFormalMatching(ctx = {}) {
  const deps = ctx.deps || {}
  const clock = ctx.clock || {}
  const matchCycleId = String(clock.matchCycleId || clock.match_cycle_id || '')
  if (typeof deps.list !== 'function') {
    return { matched_count: 0, users_considered: 0, candidates_evaluated: 0 }
  }
  const users = (await deps.list('user', { status: 1 }, 500) || [])
    .filter((row) => canEnterFormalCandidatePool(row))
    .filter((row) => memberStatus(row) === MEMBER_STATUS.APPROVED)
    .filter((row) => isVipActive(row))
  const claims = await deps.list('match_claim', { status: CLAIM_STATUS }, 500)
  const { cycleClaimed, historicalClaimsByPair } = indexClaimsForMatching(claims, matchCycleId)
  const settings = await deps.list('user_match_setting', {}, 500)
  const settingsByUserId = {}
  ;(settings || []).forEach((row) => {
    settingsByUserId[String(row.user_id)] = row
  })
  const pool = users
    .filter((row) => !cycleClaimed.has(Number(row.id)))
    .filter((row) => !intentMatchGate(settingsByUserId[String(row.id)]))
  let matchedCount = 0
  let evaluated = 0
  const remaining = pool.slice()
  const deliver = typeof deps.deliverPair === 'function' ? deps.deliverPair : deliverPair
  const claimStore = typeof deps.claimStore === 'function' ? deps.claimStore() : (deps.deliverPair ? null : createCloudClaimStore())
  const rerank = typeof deps.semanticRerank === 'function' ? deps.semanticRerank : semanticRerank
  const loadCorpus = typeof deps.loadCorpus === 'function' ? deps.loadCorpus : loadRagCorpus
  while (remaining.length >= 2) {
    const user = remaining.shift()
    const cohortCandidates = remaining.filter((candidate) => sharesCandidateCohort(user, candidate))
    const ranked = rankCandidates(user, cohortCandidates, settingsByUserId, { blockedIds: cycleClaimed })
      .filter((item) => !isHistoricalPair(user, item.candidate, historicalClaimsByPair))
    evaluated += ranked.length
    const reranked = await rerank(ranked, user, settingsByUserId, { loadCorpus })
    if (!reranked || reranked.applied !== true) continue
    if (reranked.degraded === true) {
      console.warn('[formal-matching] degraded mode:', String(reranked.reason || 'fallback_deterministic'))
    }
    const best = reranked.ranked.find((item) => item.quality && item.quality.pass)
    if (!best) continue
    const partner = best.candidate
    const requestId = matchCycleId
      ? `formal:${matchCycleId}:${user.id}:${partner.id}`
      : `formal:${clock.businessDate}:${user.id}:${partner.id}`
    const pairKey = canonicalPairKey(user.id, partner.id)
    const currentQaRunKey = qaRunKey(user, partner)
    const deliveryData = {
      logA: {
        user_id: user.id,
        match_user_id: partner.id,
        view_similarity: best.viewSimilarity,
        total_score: best.scoreA.total,
        score_detail_json: JSON.stringify(semanticDetail(best, 'a', reranked.ranked.indexOf(best) + 1, reranked)),
        score_version: 'algo_evidence_v3',
        match_date: clock.businessDate,
        match_type: clock.matchType || '正式匹配',
        pair_key: pairKey,
        match_cycle_id: matchCycleId || null
      },
      logB: {
        user_id: partner.id,
        match_user_id: user.id,
        view_similarity: best.viewSimilarity,
        total_score: best.scoreB.total,
        score_detail_json: JSON.stringify(semanticDetail(best, 'b', reranked.ranked.indexOf(best) + 1, reranked)),
        score_version: 'algo_evidence_v3',
        match_date: clock.businessDate,
        match_type: clock.matchType || '正式匹配',
        pair_key: pairKey,
        match_cycle_id: matchCycleId || null
      },
      audit: {
        request_id: requestId,
        pair_key: pairKey,
        user_id: user.id,
        match_user_id: partner.id,
        status: 'matched',
        action: 'formal_batch',
        ...(reranked && reranked.rag ? { rag: Object.assign({}, reranked.rag) } : {}),
        match_cycle_id: matchCycleId || null,
        ...(currentQaRunKey ? { qa_match_run_key: currentQaRunKey } : {}),
        ...(reranked && reranked.degraded === true
          ? { degraded: true, degraded_reason: String(reranked.reason || 'fallback_deterministic') }
          : {})
      }
    }
    const delivery = await deliver({
      userId: user.id,
      partnerId: partner.id,
      requestId,
      matchCycleId,
      qaMatchRunKey: currentQaRunKey,
      qaUserRunId: currentQaRunKey ? user.qa_match_run_id : '',
      qaPartnerRunId: currentQaRunKey ? partner.qa_match_run_id : '',
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
    cycleClaimed.add(Number(user.id))
    cycleClaimed.add(Number(partner.id))
    if (!historicalClaimsByPair.has(pairKey)) historicalClaimsByPair.set(pairKey, [])
    historicalClaimsByPair.get(pairKey).push(Object.assign({}, delivery.claim || {}, {
      pair_key: pairKey,
      create_time: new Date()
    }))
    const idx = remaining.findIndex((row) => Number(row.id) === Number(partner.id))
    if (idx >= 0) remaining.splice(idx, 1)
  }
  return {
    matched_count: matchedCount,
    users_considered: users.length,
    candidates_evaluated: evaluated,
    match_cycle_id: matchCycleId || null
  }
}

module.exports = { executeFormalMatching }
