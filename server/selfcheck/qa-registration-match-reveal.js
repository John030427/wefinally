const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  QA_REGISTRATION_CONFIRM_TEXT,
  canReplayRegistration,
  createQaMatchRunId,
  qaRunKey,
  shouldExcludeHistoricalPair,
  buildReplayRequestPatch,
  buildReplayCompletionPatch,
  buildResetMatchSettingPatch
} = require('../../miniprogram/cloudfunctions/api/lib/qaRegistrationReplayPolicy')
const {
  seenStorageKey,
  createRevealSessionState,
  dismissForSession,
  shouldRevealLatestMatch
} = require('../../miniprogram/utils/matchResultReveal')
const {
  mutualMatchPair,
  hardRejectPair
} = require('./fixtures/real-device-match-profiles')
const { rankCandidates } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')
const { sharesCandidateCohort } = require('../../miniprogram/cloudfunctions/api/lib/matchCohortPolicy')
const { registrationReplayEnabledFromProfile } = require('../../miniprogram/utils/qaMatchSimulator')

assert.strictEqual(canReplayRegistration({ account_mode: 'production' }), false)
assert.strictEqual(canReplayRegistration({ qa_test_run_enabled: true }), true)
assert.strictEqual(canReplayRegistration({ account_mode: 'internal_qa' }), true)
assert.throws(
  () => buildReplayRequestPatch({ confirm_text: '重新注册' }, new Date('2026-08-30T08:00:00Z')),
  /确认文字/
)
const requestPatch = buildReplayRequestPatch(
  { confirm_text: QA_REGISTRATION_CONFIRM_TEXT, request_id: 'qa-reset-001' },
  new Date('2026-08-30T08:00:00Z')
)
assert.strictEqual(requestPatch.registration_replay_pending, 1)
assert.strictEqual(requestPatch.qa_registration_reset_request_id, 'qa-reset-001')
assert.strictEqual(requestPatch.qa_match_cohort, 'qa-real-device-registration-v1')
assert.strictEqual(buildReplayCompletionPatch({ gender: '女', birth_year: '1994' }).gender, 2)
assert.strictEqual(buildReplayCompletionPatch({ gender: '男', birth_year: '1992' }).registration_replay_pending, 0)
assert.strictEqual(buildResetMatchSettingPatch().last_edit_time, null)
assert.strictEqual(buildResetMatchSettingPatch().age_min, null)
assert.strictEqual(sharesCandidateCohort({}, {}), true)
assert.strictEqual(sharesCandidateCohort({ qa_match_cohort: 'pair-a' }, {}), false)
assert.strictEqual(sharesCandidateCohort({ qa_match_cohort: 'pair-a' }, { qa_match_cohort: 'pair-b' }), false)
assert.strictEqual(sharesCandidateCohort({ qa_match_cohort: 'pair-a' }, { qa_match_cohort: 'pair-a' }), true)
assert.strictEqual(registrationReplayEnabledFromProfile({ qa_test_run_enabled: true }), false)
assert.strictEqual(registrationReplayEnabledFromProfile({ qa_registration_replay_enabled: true }), true)

const oldClaim = {
  pair_key: '10:11',
  created_at: new Date('2026-08-20T00:00:00Z')
}
const qaA = {
  id: 10,
  qa_test_run_enabled: true,
  qa_match_cohort: 'qa-real-device-registration-v1',
  qa_match_run_id: 'run-a2',
  qa_match_run_started_at: new Date('2026-08-21T00:00:00Z')
}
const qaB = {
  id: 11,
  qa_test_run_enabled: true,
  qa_match_cohort: 'qa-real-device-registration-v1',
  qa_match_run_id: 'run-b2',
  qa_match_run_started_at: new Date('2026-08-21T00:01:00Z')
}
assert.strictEqual(shouldExcludeHistoricalPair(oldClaim, qaA, qaB), false)
assert.strictEqual(shouldExcludeHistoricalPair({
  ...oldClaim,
  created_at: new Date('2026-08-22T00:00:00Z')
}, qaA, qaB), true)
assert.strictEqual(shouldExcludeHistoricalPair(oldClaim, { ...qaA, qa_test_run_enabled: false }, qaB), true)
assert.strictEqual(shouldExcludeHistoricalPair(oldClaim, qaA, { ...qaB, qa_match_run_id: '' }), true)
assert.strictEqual(qaRunKey(qaA, qaB), qaRunKey(qaB, qaA))
assert.match(
  createQaMatchRunId(10, new Date('2026-08-21T00:00:00Z'), 'abc12345'),
  /^qarun_10_/
)

const profile = { id: 123, support_code: 'WF000123' }
assert.strictEqual(seenStorageKey(profile), 'wf_match_reveal_seen_123')
assert.strictEqual(shouldRevealLatestMatch({
  latest: { id: 99, matchDate: '2026-08-29' },
  seenMatchId: '',
  now: new Date('2026-08-30T08:00:00+08:00')
}), true)
assert.strictEqual(shouldRevealLatestMatch({
  latest: { id: 99, matchDate: '2026-08-29' },
  seenMatchId: '99',
  now: new Date('2026-08-30T08:00:00+08:00')
}), false)
const initialRevealSession = createRevealSessionState()
const dismissedRevealSession = dismissForSession(initialRevealSession, 99)
assert.deepStrictEqual(initialRevealSession, { dismissedMatchIds: [] })
assert.deepStrictEqual(dismissedRevealSession, { dismissedMatchIds: ['99'] })
assert.deepStrictEqual(dismissForSession(dismissedRevealSession, '99'), dismissedRevealSession)
assert.strictEqual(shouldRevealLatestMatch({
  latest: { id: 99, matchDate: '2026-08-29' },
  seenMatchId: '',
  sessionDismissedMatchIds: dismissedRevealSession.dismissedMatchIds,
  now: new Date('2026-08-30T08:00:00+08:00')
}), false)
assert.strictEqual(shouldRevealLatestMatch({
  latest: { id: 100, matchDate: '2026-08-31' },
  seenMatchId: '',
  now: new Date('2026-08-30T08:00:00+08:00')
}), false)

function ranked(pair) {
  const users = [pair.male.user, pair.female.user]
  const settings = {
    [String(pair.male.user.id)]: pair.male.setting,
    [String(pair.female.user.id)]: pair.female.setting
  }
  return {
    male: rankCandidates(users[0], [users[1]], settings),
    female: rankCandidates(users[1], [users[0]], settings)
  }
}

const mutual = ranked(mutualMatchPair)
assert.strictEqual(mutual.male.length, 1)
assert.strictEqual(mutual.female.length, 1)
assert.strictEqual(mutual.male[0].quality.pass, true)
assert.strictEqual(mutual.female[0].quality.pass, true)
assert.ok(mutual.male[0].scoreA.total >= 90)
assert.ok(mutual.male[0].scoreB.total >= 90)

const rejected = ranked(hardRejectPair)
assert.strictEqual(rejected.male.length, 0)
assert.strictEqual(rejected.female.length, 0)

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8')
}

const routeSource = source('miniprogram/cloudfunctions/api/handlers/route.js')
const userSource = source('miniprogram/cloudfunctions/api/handlers/user.js')
const authSource = source('miniprogram/cloudfunctions/api/handlers/auth.js')
const formalSource = source('miniprogram/cloudfunctions/api/lib/formalMatching.js')
const panelSource = source('miniprogram/components/qa-match-panel/qa-match-panel.wxml')
const indexSource = source('miniprogram/pages/index/index.wxml')
const indexJsSource = source('miniprogram/pages/index/index.js')
assert.ok(routeSource.includes('POST /api/user/qa-registration-reset'))
assert.ok(userSource.includes('canReplayRegistration(user)'))
assert.ok(userSource.includes('qa_registration_replay_enabled: canReplayRegistration(user)'))
assert.ok(userSource.includes("action: 'request_qa_registration_replay'"))
assert.ok(userSource.includes("store.byDocId('user_match_setting', setting._id)"))
assert.ok(authSource.includes('registration_replay_pending'))
assert.ok(formalSource.includes('sharesCandidateCohort(user, candidate)'))
assert.ok(panelSource.includes('重新注册测试资料'))
assert.ok(panelSource.includes('wx:if="{{resetVisible}}"'))
assert.ok(indexSource.includes('<new-match-reveal'))
assert.ok(indexSource.includes('bind:view="onMatchRevealView"'))
const dismissHandler = indexJsSource.match(/onMatchRevealDismiss\(\)\s*\{([\s\S]*?)\n\s*\},/)
assert.ok(dismissHandler)
assert.ok(dismissHandler[1].includes('dismissForSession'))
assert.ok(!dismissHandler[1].includes('markLatestMatchSeen'))
const seenHandler = indexJsSource.match(/markLatestMatchSeen\(\)\s*\{([\s\S]*?)\n\s*\},/)
assert.ok(seenHandler && seenHandler[1].includes('try {') && seenHandler[1].includes('catch'))
const viewHandler = indexJsSource.match(/onMatchRevealView\(\)\s*\{([\s\S]*?)\n\s*\},/)
assert.ok(viewHandler && viewHandler[1].includes('markLatestMatchSeen') && viewHandler[1].includes('goMatchDetail'))

console.log('QA REGISTRATION MATCH REVEAL SELF-CHECK PASSED')
