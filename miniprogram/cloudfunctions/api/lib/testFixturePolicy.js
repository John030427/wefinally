function isMatchOnlyFixture(user) {
  return Boolean(user)
    && Number(user.is_test_fixture || 0) === 1
    && (Number(user.is_match_effect_fixture || 0) === 1
      || Number(user.allow_date_coordination || 0) === 0)
}

function fixtureOwnerId(user) {
  return Number(user && (user.fixture_owner_user_id || user.ab_test_owner_user_id) || 0)
}

function fixtureNotExpired(user, now = new Date()) {
  const value = user && (user.fixture_expires_at || user.ab_test_expires_at)
  if (!value) return true
  const expiresAt = new Date(value).getTime()
  return Number.isFinite(expiresAt) && expiresAt > new Date(now).getTime()
}

function canUseFixtureForMatch(viewer, candidate, now = new Date()) {
  if (!isMatchOnlyFixture(candidate)) return true
  return fixtureOwnerId(candidate) === Number(viewer && viewer.id || 0)
    && fixtureNotExpired(candidate, now)
}

function assertOfflineDatingAllowed(user) {
  if (isMatchOnlyFixture(user)) {
    throw new Error('测试画像仅用于匹配效果验证，不能发起约会或线下见面')
  }
}

module.exports = {
  isMatchOnlyFixture,
  fixtureOwnerId,
  fixtureNotExpired,
  canUseFixtureForMatch,
  assertOfflineDatingAllowed
}
