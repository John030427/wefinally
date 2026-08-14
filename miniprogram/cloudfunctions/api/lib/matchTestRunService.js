const { isInternalQaAccount, canUseFixtureForMatch, isSyntheticFixture } = require('./testIdentityPolicy')
const { memberStatus, MEMBER_STATUS, canUseMatching } = require('./memberPolicy')
const { isVipActive } = require('./format')
const { rankCandidates } = require('./matchPolicy')

function deny(message, code = 403) {
  const error = new Error(message)
  error.code = code
  throw error
}

function assertQa(user) {
  if (!isInternalQaAccount(user)) deny('仅内部测试账号可以运行测试匹配', 403)
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
    message: row.message || ''
  }
}

function createMatchTestRunHandlers(deps) {
  async function create(data, wxContext) {
    const user = await deps.currentUser(wxContext)
    assertQa(user)
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
    assertQa(user)
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
      const best = ranked.find((item) => item.quality && item.quality.pass)
      if (!best) {
        return publicRun(await deps.completeRun(claimedRun, { patch: {
          status: 'completed_no_match', reason_code: 'completed_no_match', matched_count: 0, message: '本轮无匹配结果'
        } }))
      }
      const partner = best.candidate
      return publicRun(await deps.completeRun(claimedRun, {
        log: {
          user_id: user.id,
          match_user_id: partner.id,
          view_similarity: best.viewSimilarity,
          total_score: best.scoreA && best.scoreA.total,
          match_date: deps.now(),
          match_type: '内部测试',
          internal_test_run_id: claimedRun.id,
          pair_key: `test:${claimedRun.id}`
        },
        patch: { status: 'completed_matched', reason_code: 'matched', matched_count: 1, message: '测试匹配成功' }
      }))
    } catch (error) {
      return publicRun(await deps.completeRun(claimedRun, { patch: {
        status: 'failed', reason_code: 'failed', message: '测试运行失败，可安全重试'
      } }))
    }
  }

  async function get(data, wxContext) {
    const user = await deps.currentUser(wxContext)
    assertQa(user)
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
