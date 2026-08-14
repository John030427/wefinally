const TEST_OPENID = /^(dev|test|fixture|mock)[_-]/i

function number(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function text(value) {
  return String(value || '').trim()
}

function isSyntheticFixture(user = {}) {
  user = user || {}
  const origin = text(user.profile_origin)
  if (origin === 'synthetic_fixture') return true
  if (origin === 'real_user') return false
  if (Number(user.is_test_fixture || 0) === 1) return true
  return number(user.fixture_owner_user_id || user.ab_test_owner_user_id) > 0
}

function isInternalQaAccount(user = {}) {
  user = user || {}
  if (isSyntheticFixture(user)) return false
  const mode = text(user.account_mode)
  if (mode === 'internal_qa') return true
  if (mode === 'production') return false
  return TEST_OPENID.test(text(user.openid))
}

function fixtureOwnerId(user) {
  return number(user && (user.fixture_owner_user_id || user.ab_test_owner_user_id))
}

function fixtureExpiresAt(user) {
  return user && (user.fixture_expires_at || user.ab_test_expires_at) || null
}

function fixtureNotExpired(user, now = new Date()) {
  const value = fixtureExpiresAt(user)
  if (!value) return true
  const expiresAt = new Date(value).getTime()
  return Number.isFinite(expiresAt) && expiresAt > new Date(now).getTime()
}

function resolveTestIdentity(user = {}) {
  const synthetic = isSyntheticFixture(user)
  const qa = isInternalQaAccount(user)
  const kind = synthetic ? 'synthetic_fixture' : (qa ? 'internal_qa' : 'real_user')
  return {
    kind,
    profile_origin: synthetic ? 'synthetic_fixture' : 'real_user',
    account_mode: qa ? 'internal_qa' : 'production',
    test_scope: synthetic ? 'matching' : 'none',
    fixture_owner_user_id: synthetic ? fixtureOwnerId(user) : 0,
    fixture_run_id: synthetic ? text(user.fixture_run_id || user.ab_test_run_id) : '',
    fixture_expires_at: synthetic ? fixtureExpiresAt(user) : null,
    allow_date_coordination: synthetic ? false : true,
    identity_badge: kind === 'synthetic_fixture' ? '合成测试画像' : (kind === 'internal_qa' ? '内部测试账号' : '真人用户')
  }
}

function identityBadge(user) {
  return resolveTestIdentity(user).identity_badge
}

function canEnterFormalCandidatePool(user) {
  return !isSyntheticFixture(user)
}

function canUseFixtureForMatch(viewer, candidate, now = new Date()) {
  if (!isSyntheticFixture(candidate)) return true
  return isInternalQaAccount(viewer)
    && fixtureOwnerId(candidate) === number(viewer && viewer.id)
    && fixtureNotExpired(candidate, now)
}

function assertOfflineDatingAllowed(user) {
  if (isSyntheticFixture(user)) {
    throw new Error('测试画像仅用于匹配效果验证，不能发起约会或线下见面')
  }
}

function syntheticWriteDefaults(input = {}) {
  const ownerUserId = number(input.ownerUserId)
  const runId = text(input.runId)
  if (!ownerUserId) throw new Error('合成画像必须绑定内部测试账号')
  return {
    profile_origin: 'synthetic_fixture',
    account_mode: 'production',
    test_scope: 'matching',
    fixture_owner_user_id: ownerUserId,
    fixture_run_id: runId,
    fixture_expires_at: input.expiresAt || null,
    allow_date_coordination: false,
    is_test_fixture: 1,
    is_match_effect_fixture: 1,
    ab_test_owner_user_id: ownerUserId,
    ab_test_run_id: runId,
    ab_test_expires_at: input.expiresAt || null
  }
}

function planProfileProvenance(users = []) {
  return (users || []).map((user) => {
    const id = number(user && user.id)
    if (!id) return null
    const origin = text(user.profile_origin)
    if (origin === 'synthetic_fixture' || origin === 'real_user') return null
    if (Number(user.is_test_fixture || 0) !== 1) return null
    const owner = fixtureOwnerId(user)
    if (!owner) {
      return { id, reason: 'legacy is_test_fixture', proposed: null, conflicts: ['missing_fixture_owner'] }
    }
    return {
      id,
      reason: 'legacy is_test_fixture',
      proposed: syntheticWriteDefaults({
        ownerUserId: owner,
        runId: text(user.fixture_run_id || user.ab_test_run_id),
        expiresAt: fixtureExpiresAt(user)
      }),
      conflicts: []
    }
  }).filter(Boolean)
}

module.exports = {
  TEST_OPENID,
  resolveTestIdentity,
  identityBadge,
  isSyntheticFixture,
  isInternalQaAccount,
  fixtureOwnerId,
  fixtureNotExpired,
  canEnterFormalCandidatePool,
  canUseFixtureForMatch,
  assertOfflineDatingAllowed,
  syntheticWriteDefaults,
  planProfileProvenance
}
