const { isInternalQaAccount, canUseFixtureForMatch, isSyntheticFixture } = require('./testIdentityPolicy')
const { memberStatus, MEMBER_STATUS, canUseMatching } = require('./memberPolicy')
const { isVipActive } = require('./format')
const { rankCandidates, scoreDetailFor } = require('./matchPolicy')

function deny(message, code = 403) {
  const error = new Error(message)
  error.code = code
  throw error
}

async function assertTestAccess(user, deps) {
  const publicEnabled = deps.publicEnabled && await deps.publicEnabled()
  if (!isInternalQaAccount(user) && !publicEnabled) deny('仅内部测试账号可以运行测试匹配', 403)
}

function publicRun(row) {
  if (!row) return null
  return {
    id: row.id,
    run_id: row.id,
    mode: row.mode,
    status: row.status,
    batch_key: row.batch_key,
    request_id: row.request_id,
    execute_after: row.execute_after,
    reason_code: row.reason_code || '',
    matched_count: Number(row.matched_count || 0),
    match_id: row.match_id || null,
    ai_applied: row.ai_rerank_applied === true,
    ai_model: row.ai_rerank_model || '',
    message: row.message || ''
  }
}

function semanticDetail(best, side, algorithmRank, reranked) {
  const detail = scoreDetailFor(best, side, algorithmRank)
  const baseNormalizedTotal = detail.normalized_total
  const semanticScore = best.canonical_score !== null && best.canonical_score !== undefined
    ? Number(best.canonical_score)
    : Number(baseNormalizedTotal || 0)
  const finalMatchScore = Math.max(0, Math.min(100, Math.round(semanticScore)))
  return Object.assign(detail, {
    base_normalized_total: baseNormalizedTotal,
    final_match_score: finalMatchScore,
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
    ai_rerank: {
      applied: reranked.applied === true,
      reason: reranked.reason || '',
      model: reranked.model || ''
    }
  })
}

function createMatchTestRunHandlers(deps) {
  async function create(data, wxContext) {
    const user = await deps.currentUser(wxContext)
    await assertTestAccess(user, deps)
    const requestId = String(data.request_id || '').trim()
    if (requestId.length < 8) throw new Error('请求编号无效')
    const batchKey = `test:${user.id}:${requestId}`
    const executeAfter = new Date(deps.now().getTime() + 10000)
    const acquired = await deps.acquireRun({
      batch_key: batchKey,
      mode: 'internal_test',
      status: 'queued',
      request_id: requestId,
      trigger_source: 'internal_test_button',
      requester_user_id: Number(user.id),
      execute_after: executeAfter,
      matched_count: 0
    })
    return publicRun(acquired.batch)
  }

  async function loadOwned(id, user) {
    const run = await deps.byId('match_batch_run', Number(id || 0))
    if (!run || run.mode !== 'internal_test' || Number(run.requester_user_id) !== Number(user.id)) {
      deny('测试运行不存在', 404)
    }
    return run
  }

  async function execute(data, wxContext) {
    const user = await deps.currentUser(wxContext)
    await assertTestAccess(user, deps)
    const run = await loadOwned(data.id || data.run_id, user)
    if (['completed_matched', 'completed_no_match', 'blocked'].includes(run.status)) {
      return publicRun(run)
    }
    if (new Date(run.execute_after).getTime() > deps.now().getTime()) return publicRun(run)
    const claim = await deps.claimRun(run, deps.now())
    if (!claim.acquired) return publicRun(claim.batch || run)
    const claimedRun = claim.batch
    try {
      if (!canUseMatching({ member_status: memberStatus(user), vipActive: isVipActive(user) })) {
        return publicRun(await deps.completeRun(claimedRun, { patch: {
          status: 'blocked', reason_code: 'not_eligible', message: '资料或会员资格不满足测试匹配条件'
        } }))
      }
      const candidates = (await deps.list('user', { status: 1 }, 200) || [])
        .filter((item) => Number(item.id) !== Number(user.id))
        .filter((item) => isSyntheticFixture(item) && canUseFixtureForMatch(user, item, deps.now()))
        .filter((item) => memberStatus(item) === MEMBER_STATUS.APPROVED)
      if (!candidates.length) {
        return publicRun(await deps.completeRun(claimedRun, { patch: {
          status: 'blocked', reason_code: 'no_owned_fixture', message: '没有归属当前账号且未过期的合成测试画像'
        } }))
      }
      const settings = await deps.list('user_match_setting', {}, 200)
      const settingsByUserId = {}
      ;(settings || []).forEach((row) => { settingsByUserId[String(row.user_id)] = row })
      const ranked = rankCandidates(user, candidates, settingsByUserId)
      const reranked = await deps.semanticRerank(ranked, user, settingsByUserId)
      if (!reranked || reranked.applied !== true) {
        return publicRun(await deps.completeRun(claimedRun, { patch: {
          status: 'failed',
          reason_code: 'ai_rerank_unavailable',
          ai_rerank_applied: false,
          ai_rerank_reason: reranked && reranked.reason || 'unavailable',
          message: 'AI匹配暂不可用，请稍后重试'
        } }))
      }
      const best = reranked.ranked.find((item) => item.quality && item.quality.pass)
      if (!best) {
        return publicRun(await deps.completeRun(claimedRun, { patch: {
          status: 'completed_no_match', reason_code: 'completed_no_match', matched_count: 0, message: '本轮无匹配结果'
        } }))
      }
      const partner = best.candidate
      const algorithmRank = ranked.findIndex((item) => Number(item.candidate.id) === Number(partner.id)) + 1
      const scoreDetailA = semanticDetail(best, 'a', algorithmRank, reranked)
      const scoreDetailB = semanticDetail(best, 'b', algorithmRank, reranked)
      return publicRun(await deps.completeRun(claimedRun, {
        log: {
          user_id: user.id,
          match_user_id: partner.id,
          view_similarity: best.viewSimilarity,
          total_score: best.scoreA && best.scoreA.total,
          score_detail_json: JSON.stringify(scoreDetailA),
          counterpart_score_detail_json: JSON.stringify(scoreDetailB),
          score_version: 'algo_evidence_v3',
          match_date: deps.now(),
          match_type: 'AI测试匹配',
          internal_test_run_id: claimedRun.id,
          pair_key: `test:${claimedRun.id}`
        },
        patch: {
          status: 'completed_matched',
          reason_code: 'matched',
          matched_count: 1,
          ai_rerank_applied: true,
          ai_rerank_model: reranked.model || '',
          message: 'AI测试匹配成功'
        }
      }))
    } catch (error) {
      return publicRun(await deps.completeRun(claimedRun, { patch: {
        status: 'failed', reason_code: 'failed', message: '测试运行失败，可安全重试'
      } }))
    }
  }

  async function get(data, wxContext) {
    const user = await deps.currentUser(wxContext)
    await assertTestAccess(user, deps)
    if (data.latest === true || data.latest === '1') {
      const rows = (await deps.list('match_batch_run', { requester_user_id: Number(user.id), mode: 'internal_test' }, 50) || [])
        .sort((a, b) => Number(b.id) - Number(a.id))
      return publicRun(rows[0] || null)
    }
    return publicRun(await loadOwned(data.id || data.run_id, user))
  }

  return { create, execute, get }
}

module.exports = { createMatchTestRunHandlers }
