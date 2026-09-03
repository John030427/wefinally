const {
  isSyntheticFixture,
  fixtureOwnerId,
  fixtureNotExpired,
  canUseFixtureForMatch,
  canEnterFormalCandidatePool,
  assertOfflineDatingAllowed
} = require('./testIdentityPolicy')

function isMatchOnlyFixture(user) {
  return isSyntheticFixture(user)
}

module.exports = {
  isMatchOnlyFixture,
  fixtureOwnerId,
  fixtureNotExpired,
  canUseFixtureForMatch,
  canEnterFormalCandidatePool,
  assertOfflineDatingAllowed
}
