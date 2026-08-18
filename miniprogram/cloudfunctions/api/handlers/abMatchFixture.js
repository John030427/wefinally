const crypto = require('crypto')
const { MEMBER_STATUS, memberStatus } = require('../lib/memberPolicy')
const { syntheticWriteDefaults } = require('../lib/testIdentityPolicy')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    byId: db.byId,
    first: db.first,
    list: db.list,
    addWithId: db.addWithId,
    removeByDoc: db.removeByDoc,
    updateByDoc: db.updateByDoc,
    now: db.now,
    randomId: () => `ab_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
  }
}

function validateActor(actor) {
  if (!actor || actor.role !== 'admin' || actor.admin_role !== 'super_admin') {
    throw new Error('仅超级管理员可以管理 A/B 测试候选')
  }
}

const ALLOWED_JOURNEYS = new Set(['accept', 'reject'])
const INTERNAL_JOURNEYS = new Set(['accept', 'reject', 'legacy_queue'])

function resolveFixtureJourneyInput(input = {}) {
  const raw = String(input.fixture_journey || input.journey || '').trim().toLowerCase()
  if (!raw) return 'accept'
  if (INTERNAL_JOURNEYS.has(raw)) return raw
  throw new Error('fixture_journey 仅支持 accept、reject，或显式内部值 legacy_queue')
}

function resolveFixtureModeInput(input = {}) {
  const raw = String(input.fixture_mode || input.mode || 'auto').trim().toLowerCase()
  if (!raw || raw === 'auto') return 'auto'
  if (raw === 'manual_step' || raw === 'manual') return 'manual_step'
  throw new Error('fixture_mode 仅支持 auto 或 manual_step')
}

function normalizeInput(input = {}) {
  const action = String(input.action || '').trim()
  const ownerUserId = Number(input.ownerUserId || 0)
  const reason = String(input.reason || '').trim().slice(0, 500)
  const requestId = String(input.requestId || '').trim().slice(0, 100)
  const runId = String(input.runId || '').trim().slice(0, 100)
  if (!['prepare', 'cleanup'].includes(action)) throw new Error('A/B 测试操作无效')
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) throw new Error('A账号ID无效')
  if (!reason) throw new Error(action === 'prepare' ? '请填写测试原因' : '请填写清理原因')
  if (requestId.length < 16) throw new Error('请求标识无效')
  if (action === 'cleanup' && runId.length < 16) throw new Error('测试编号无效')
  const fixtureJourney = action === 'prepare' ? resolveFixtureJourneyInput(input) : ''
  const fixtureMode = action === 'prepare' ? resolveFixtureModeInput(input) : ''
  if (action === 'prepare' && fixtureJourney && !ALLOWED_JOURNEYS.has(fixtureJourney) && fixtureJourney !== 'legacy_queue') {
    throw new Error('fixture_journey 无效')
  }
  return {
    action,
    ownerUserId,
    reason,
    requestId,
    runId,
    fixture_journey: fixtureJourney,
    fixture_mode: fixtureMode
  }
}

function heightPreference(value) {
  const values = String(value || '').match(/\d+/g) || []
  if (!values.length) return { min: null, max: null }
  const first = Number(values[0])
  const second = Number(values[1] || 0)
  if (second) return { min: Math.max(120, first - 5), max: Math.min(220, second + 5) }
  return { min: Math.max(120, first - 5), max: Math.min(220, first + 15) }
}

function activeInternalTestVip(user, now) {
  return Number(user.is_vip || 0) === 1
    && String(user.vip_source || '') === 'internal_test'
    && new Date(user.vip_expire_time || 0).getTime() > now.getTime()
}

function fixtureProfile(owner, ownerSetting, runId, now, journey = 'accept', mode = 'auto') {
  const candidateGender = Number(owner.gender) === 1 ? 2 : 1
  const targetAge = Number(ownerSetting.age_min || 20) <= 23
    && Number(ownerSetting.age_max || 65) >= 23
    ? 23
    : Math.max(18, Math.min(60, Number(ownerSetting.age_min || 23)))
  const ownerAge = now.getFullYear() - Number(owner.birth_year || now.getFullYear() - 30)
  const ownerHeight = heightPreference(owner.height_range)
  const candidateHeightMin = Number(ownerSetting.height_min || 160)
  const candidateHeightMax = Number(ownerSetting.height_max || candidateHeightMin + 10)
  const candidateHeight = `${candidateHeightMin}-${candidateHeightMax}cm`
  const selfText = String(ownerSetting.target_view_text || '').trim()
  const targetText = String(ownerSetting.self_view_text || '').trim()
  const resolvedJourney = String(journey || 'accept').toLowerCase() === 'reject' ? 'reject' : 'accept'
  return {
    user: {
      openid: `ab_test_fixture_${runId}`,
      gender: candidateGender,
      birth_year: now.getFullYear() - targetAge,
      height_range: candidateHeight,
      education: owner.education || ownerSetting.min_education || '本科',
      circle_id: Number(owner.circle_id || 1),
      circle_name: owner.circle_name || '',
      city: owner.city || '深圳',
      marry_status: ownerSetting.like_marry_status === '不限'
        ? (owner.marry_status || '未婚')
        : (ownerSetting.like_marry_status || owner.marry_status || '未婚'),
      baby_plan: ownerSetting.like_baby_plan === '不限'
        ? (owner.baby_plan || '3-5年内')
        : (ownerSetting.like_baby_plan || owner.baby_plan || '3-5年内'),
      income_range: owner.income_range || '',
      house_car: owner.house_car || '',
      status: 1,
      member_status: MEMBER_STATUS.APPROVED,
      member_status_updated_at: now,
      is_vip: 1,
      vip_expire_time: new Date(now.getTime() + 86400000),
      vip_source: 'internal_test',
      free_member: 1,
      free_source: 'ab_test_fixture',
      appearance_description: '干净清爽，日常穿搭简洁自然',
      appearance_want: '希望对方穿搭简洁、喜欢运动',
      appearance_tags: '',
      appearance_want_tags: '',
      promote_partner_id: Number(owner.promote_partner_id || 0),
      promote_code: '',
      ...syntheticWriteDefaults({
        ownerUserId: owner.id,
        runId,
        expiresAt: new Date(now.getTime() + 86400000)
      }),
      fixture_journey: resolvedJourney,
      fixture_mode: String(mode || 'auto').toLowerCase() === 'manual_step' ? 'manual_step' : 'auto'
    },
    setting: {
      age_min: Math.max(18, ownerAge - 2),
      age_max: ownerAge + 2,
      height_min: ownerHeight.min,
      height_max: ownerHeight.max,
      min_education: owner.education || '',
      like_circle_ids: String(owner.circle_id || ''),
      like_marry_status: owner.marry_status || '不限',
      like_baby_plan: owner.baby_plan || '',
      like_house_car: '',
      like_income: '',
      self_view_text: selfText,
      target_view_text: targetText,
      psych_profile_json: ownerSetting.psych_profile_json || null,
      last_edit_time: now,
      ab_test_run_id: runId,
      is_test_fixture: 1
    }
  }
}

function isTaggedTestRow(row, runId) {
  if (!row) return false
  if (runId && String(row.ab_test_run_id || row.fixture_run_id || '') === String(runId)) return true
  return Number(row.is_test_data || row.is_test_fixture || 0) === 1
}

async function collectTestCoordinations(dep, { ownerUserId, candidateId, runId }) {
  const asInvitee = await dep('list')('date_coordination', { user_b_id: Number(candidateId) }, 100)
  const asInitiator = await dep('list')('date_coordination', { user_a_id: Number(candidateId) }, 100)
  const withRun = await dep('list')('date_coordination', { ab_test_run_id: String(runId) }, 100)
  const merged = []
  const seen = new Set()
  for (const row of [...asInvitee, ...asInitiator, ...withRun]) {
    if (!row || seen.has(row.id)) continue
    const involvesFixtureUser = [Number(row.user_a_id), Number(row.user_b_id)].includes(Number(candidateId))
    const involvesOwnerAndFixture = Number(row.user_a_id) === Number(ownerUserId) && Number(row.user_b_id) === Number(candidateId)
    if (!involvesFixtureUser && !involvesOwnerAndFixture) continue
    if (!isTaggedTestRow(row, runId) && String(row.ab_test_run_id || '') !== String(runId)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return merged
}

async function closeTestCoordinations(dep, coordinations) {
  const now = typeof dep('now') === 'function' ? dep('now')() : new Date()
  let closedCoordinations = 0
  let closedSessions = 0
  for (const coordination of coordinations) {
    if (Number(coordination.is_test_data || 0) !== 1 && !String(coordination.ab_test_run_id || '')) continue
    if (!['arranged', 'invitation_declined', 'expired', 'cancelled', 'closed', 'manual_handoff'].includes(String(coordination.status || ''))) {
      await dep('updateByDoc')('date_coordination', coordination, {
        status: 'closed',
        business_state: 'cleaned',
        cleaned_at: now
      })
      closedCoordinations += 1
    }
    const sessions = await dep('list')('agent_session', { coordination_id: Number(coordination.id) }, 50)
    for (const session of sessions) {
      if (!['closed', 'cancelled'].includes(String(session.status || ''))) {
        await dep('updateByDoc')('agent_session', session, { status: 'closed' })
        closedSessions += 1
      }
    }
    const jobs = await dep('list')('agent_notification_job', { coordination_id: Number(coordination.id) }, 50)
    for (const job of jobs) {
      if (String(job.status || '') === 'pending') {
        await dep('updateByDoc')('agent_notification_job', job, { status: 'cancelled' })
      }
    }
    const responseJobs = await dep('list')('fixture_response_job', { fixture_user_id: Number(coordination.user_b_id) }, 20)
    for (const job of responseJobs) {
      if (Number(job.is_test_data || job.is_test_fixture || 0) === 1 || String(job.ab_test_run_id || '') === String(coordination.ab_test_run_id || '')) {
        if (String(job.status || '') !== 'delivered') {
          await dep('updateByDoc')('fixture_response_job', job, { status: 'cancelled' })
        }
      }
    }
  }
  return { closed_coordinations: closedCoordinations, closed_sessions: closedSessions }
}

function createAbMatchFixtureService(overrides = {}) {
  let defaults
  function dep(name) {
    if (overrides[name]) return overrides[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function prepare(input, actor) {
    const existingAudit = await dep('first')('partner_user_audit_log', { request_id: input.requestId })
    if (existingAudit) {
      if (
        existingAudit.action !== 'prepare_ab_match_fixture'
        || Number(existingAudit.user_id) !== input.ownerUserId
      ) throw new Error('请求标识已被其他操作使用')
      const candidate = await dep('first')('user', { ab_test_run_id: existingAudit.ab_test_run_id })
      return {
        idempotent: 1,
        run_id: existingAudit.ab_test_run_id,
        owner_user_id: input.ownerUserId,
        candidate
      }
    }

    const owner = await dep('byId')('user', input.ownerUserId)
    if (!owner) throw new Error('A账号不存在')
    const now = dep('now')()
    if (
      memberStatus(owner) !== MEMBER_STATUS.APPROVED
      || Number(owner.status) !== 1
      || !activeInternalTestVip(owner, now)
    ) {
      throw new Error('A账号必须审核通过并持有有效内测 VIP')
    }
    const ownerSetting = await dep('first')('user_match_setting', { user_id: owner.id })
    if (
      !ownerSetting
      || !String(ownerSetting.self_view_text || '').trim()
      || !String(ownerSetting.target_view_text || '').trim()
    ) throw new Error('A账号需先完成匹配偏好和三观资料')

    const journey = String(input.fixture_journey || 'accept').toLowerCase()
    const fixtureMode = String(input.fixture_mode || 'auto').toLowerCase()
    const activeFixture = await dep('first')('user', {
      ab_test_owner_user_id: owner.id,
      is_test_fixture: 1,
      status: 1,
      fixture_journey: journey
    })
    if (activeFixture) {
      return {
        idempotent: 1,
        run_id: activeFixture.ab_test_run_id,
        owner_user_id: owner.id,
        candidate: activeFixture
      }
    }

    const runId = dep('randomId')()
    const fixture = fixtureProfile(owner, ownerSetting, runId, now, journey, fixtureMode)
    const candidate = await dep('addWithId')('user', fixture.user, 'user')
    let setting
    try {
      setting = await dep('addWithId')('user_match_setting', {
        ...fixture.setting,
        user_id: candidate.id
      }, 'match_setting')
    } catch (err) {
      await dep('removeByDoc')('user', candidate)
      throw err
    }
    await dep('addWithId')('partner_user_audit_log', {
      application_id: 0,
      partner_id: Number(owner.promote_partner_id || 0),
      user_id: owner.id,
      actor_role: actor.role,
      actor_id: Number(actor.id),
      action: 'prepare_ab_match_fixture',
      from_status: 'none',
      to_status: 'active',
      reason: input.reason,
      request_id: input.requestId,
      ab_test_run_id: runId,
      test_candidate_user_id: candidate.id
    }, 'member_audit')
    return {
      run_id: runId,
      owner_user_id: owner.id,
      candidate,
      setting,
      expires_at: candidate.ab_test_expires_at
    }
  }

  async function cleanup(input, actor) {
    const existingAudit = await dep('first')('partner_user_audit_log', { request_id: input.requestId })
    if (existingAudit) {
      if (
        existingAudit.action !== 'cleanup_ab_match_fixture'
        || Number(existingAudit.user_id) !== input.ownerUserId
      ) throw new Error('请求标识已被其他操作使用')
      return { idempotent: 1, run_id: input.runId }
    }
    const candidate = await dep('first')('user', {
      ab_test_run_id: input.runId,
      ab_test_owner_user_id: input.ownerUserId,
      is_test_fixture: 1
    })
    if (!candidate) throw new Error('测试候选不存在或不属于该A账号')

    const settings = await dep('list')('user_match_setting', {
      user_id: candidate.id,
      ab_test_run_id: input.runId,
      is_test_fixture: 1
    }, 20)
    const matchLogs = await dep('list')('user_match_log', { ab_test_run_id: input.runId }, 50)
    const relatedCoordinations = await collectTestCoordinations(dep, {
      ownerUserId: input.ownerUserId,
      candidateId: candidate.id,
      runId: input.runId
    })
    const closed = await closeTestCoordinations(dep, relatedCoordinations)
    for (const row of matchLogs) await dep('removeByDoc')('user_match_log', row)
    for (const row of settings) await dep('removeByDoc')('user_match_setting', row)
    await dep('removeByDoc')('user', candidate)
    await dep('addWithId')('partner_user_audit_log', {
      application_id: 0,
      partner_id: Number(candidate.promote_partner_id || 0),
      user_id: input.ownerUserId,
      actor_role: actor.role,
      actor_id: Number(actor.id),
      action: 'cleanup_ab_match_fixture',
      from_status: 'active',
      to_status: 'removed',
      reason: input.reason,
      request_id: input.requestId,
      ab_test_run_id: input.runId,
      test_candidate_user_id: candidate.id,
      removed_match_logs: matchLogs.length,
      closed_coordinations: closed.closed_coordinations,
      closed_sessions: closed.closed_sessions
    }, 'member_audit')
    return {
      run_id: input.runId,
      removed_candidate: 1,
      removed_settings: settings.length,
      removed_match_logs: matchLogs.length,
      closed_coordinations: closed.closed_coordinations,
      closed_sessions: closed.closed_sessions
    }
  }

  async function change(rawInput, actor) {
    validateActor(actor)
    const input = normalizeInput(rawInput)
    return input.action === 'prepare' ? prepare(input, actor) : cleanup(input, actor)
  }

  return { change }
}

const service = createAbMatchFixtureService()

module.exports = {
  changeAbMatchFixture: service.change,
  createAbMatchFixtureService,
  fixtureProfile,
  normalizeInput,
  validateActor,
  collectTestCoordinations,
  closeTestCoordinations
}
