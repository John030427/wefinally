# WeFinally QA and Core UX Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real-device QA registration replay safely repeatable, simplify secondary occupation selection, add consistent bottom navigation icons, and correct match-reveal persistence semantics without changing production-user matching rules.

**Architecture:** Keep production pair-history behavior fail-closed and introduce per-user QA run boundaries that only relax claims older than both users' current QA runs. Keep UI state logic in pure CommonJS helpers so Node selfchecks can drive TDD before WXML/WXSS integration. Use a custom mini-program tab bar with local CSS-mask icons and retain the existing three tab routes.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, CloudBase Event Function on Node.js, repository Node selfchecks, PowerShell, Git.

**Spec:** `docs/superpowers/specs/2026-08-30-wefinally-qa-ui-release-hardening-design.md`

## Global Constraints

- Do not deploy CloudBase, upload the mini program, bind DNS, modify production environment variables, or write production data.
- Do not delete or rewrite historical `match_claim`, order, VIP, referral, review, or coordination data.
- Non-QA users retain permanent historical-pair exclusion.
- Missing QA permission, cohort, run id, or run timestamp fails closed.
- Use the existing WeFinally rose palette and no emoji or WXML SVG elements for the new tab icons.
- Every behavior change follows Red → Green → Refactor and receives a focused commit.
- The final subagent is read-only and runs only after main-agent verification.

---

### Task 1: Repeatable QA Pair-History Boundary

**Files:**
- Modify: `server/selfcheck/qa-registration-match-reveal.js`
- Modify: `miniprogram/cloudfunctions/api/lib/qaRegistrationReplayPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/matchCycleService.js`
- Modify: `miniprogram/cloudfunctions/api/lib/formalMatching.js`
- Modify: `miniprogram/cloudfunctions/api/lib/matchClaim.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/user.js`
- Modify: `server/selfcheck/formal-matching.js`

**Interfaces:**
- Produce: `createQaMatchRunId(userId, timestamp, nonce): string`
- Produce: `qaRunKey(left, right): string`
- Produce: `shouldExcludeHistoricalPair(claim, left, right): boolean`
- Extend delivery audit/claim data with `qa_match_run_key` only for valid QA pairs.

- [ ] **Step 1: Write failing policy tests**

Add assertions that describe the required API:

```js
const {
  createQaMatchRunId,
  qaRunKey,
  shouldExcludeHistoricalPair
} = require('../../miniprogram/cloudfunctions/api/lib/qaRegistrationReplayPolicy')

const oldClaim = { pair_key: '10:11', created_at: new Date('2026-08-20T00:00:00Z') }
const qaA = { id: 10, qa_test_run_enabled: true, qa_match_cohort: 'qa-real-device-registration-v1', qa_match_run_id: 'run-a2', qa_match_run_started_at: new Date('2026-08-21T00:00:00Z') }
const qaB = { id: 11, qa_test_run_enabled: true, qa_match_cohort: 'qa-real-device-registration-v1', qa_match_run_id: 'run-b2', qa_match_run_started_at: new Date('2026-08-21T00:01:00Z') }
assert.strictEqual(shouldExcludeHistoricalPair(oldClaim, qaA, qaB), false)
assert.strictEqual(shouldExcludeHistoricalPair({ ...oldClaim, created_at: new Date('2026-08-22T00:00:00Z') }, qaA, qaB), true)
assert.strictEqual(shouldExcludeHistoricalPair(oldClaim, { ...qaA, qa_test_run_enabled: false }, qaB), true)
assert.strictEqual(shouldExcludeHistoricalPair(oldClaim, qaA, { ...qaB, qa_match_run_id: '' }), true)
assert.strictEqual(qaRunKey(qaA, qaB), qaRunKey(qaB, qaA))
assert.match(createQaMatchRunId(10, new Date('2026-08-21T00:00:00Z'), 'abc12345'), /^qarun_10_/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node server/selfcheck/qa-registration-match-reveal.js`

Expected: FAIL because the three policy functions are not exported.

- [ ] **Step 3: Implement the pure QA run policy**

Implement deterministic canonicalization and fail-closed history checks in `qaRegistrationReplayPolicy.js`. A claim may be ignored only when both users are QA-enabled, share a non-empty cohort, have non-empty run ids, have valid run timestamps, and both timestamps are later than the claim timestamp.

```js
function shouldExcludeHistoricalPair(claim = {}, left = {}, right = {}) {
  if (!claim || !claim.pair_key) return false
  if (!canReplayRegistration(left) || !canReplayRegistration(right)) return true
  if (!cohortKey(left) || cohortKey(left) !== cohortKey(right)) return true
  if (!runId(left) || !runId(right)) return true
  const claimAt = timestampOf(claim.created_at || claim.claimed_at || claim.updated_at)
  const leftAt = timestampOf(left.qa_match_run_started_at)
  const rightAt = timestampOf(right.qa_match_run_started_at)
  if (![claimAt, leftAt, rightAt].every(Number.isFinite)) return true
  return !(leftAt > claimAt && rightAt > claimAt)
}
```

- [ ] **Step 4: Verify policy GREEN**

Run: `node server/selfcheck/qa-registration-match-reveal.js`

Expected: PASS for the new policy assertions and all existing assertions.

- [ ] **Step 5: Write failing formal-matching integration tests**

Extend `server/selfcheck/formal-matching.js` with three end-to-end in-memory cases:

```js
// old claim + both users new QA runs => one new pair delivered
// current-run claim => zero pairs delivered
// production users with old claim => zero pairs delivered
```

Assert the delivered QA pair contains a non-empty `qa_match_run_key` and the production pair does not bypass history.

- [ ] **Step 6: Run formal matching and verify RED**

Run: `node server/selfcheck/formal-matching.js`

Expected: FAIL because `formalMatching` still indexes pair keys without user/run context.

- [ ] **Step 7: Integrate run-aware claim filtering and delivery metadata**

Change historical indexing to preserve claims by canonical pair key, then call `shouldExcludeHistoricalPair(claim, user, candidate)` when filtering. Generate `qa_match_run_key` only when both users have valid current QA runs. Add fresh `qa_match_run_id` and timestamp during replay completion; ignore any client-supplied run id.

- [ ] **Step 8: Verify focused QA and formal matching GREEN**

Run:

```powershell
node server/selfcheck/qa-registration-match-reveal.js
node server/selfcheck/formal-matching.js
```

Expected: both exit 0.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- server/selfcheck/qa-registration-match-reveal.js server/selfcheck/formal-matching.js miniprogram/cloudfunctions/api/lib/qaRegistrationReplayPolicy.js miniprogram/cloudfunctions/api/lib/matchCycleService.js miniprogram/cloudfunctions/api/lib/formalMatching.js miniprogram/cloudfunctions/api/lib/matchClaim.js miniprogram/cloudfunctions/api/handlers/user.js
git commit -m "fix(qa): allow repeat matching across replay runs"
```

---

### Task 2: Searchable Secondary Identity Drawer

**Files:**
- Create: `miniprogram/utils/secondaryIdentityPicker.js`
- Create: `server/selfcheck/secondary-identity-picker.js`
- Modify: `server/package.json`
- Modify: `miniprogram/pages/register/register.js`
- Modify: `miniprogram/pages/register/register.wxml`
- Modify: `miniprogram/pages/register/register.wxss`

**Interfaces:**
- Produce: `buildSecondaryIdentityGroups(circles, primaryId, selectedIds, query): Array<{plate: string, items: Array}>`
- Produce: `toggleSecondaryIdentitySelection(selectedIds, id, max): {selectedIds, limitReached}`
- Register page state: `secondaryIdentityDrawerVisible`, `secondaryIdentityQuery`, `secondaryIdentityGroups`, `selectedSecondaryIdentities`.

- [ ] **Step 1: Write failing pure-function tests**

Create `server/selfcheck/secondary-identity-picker.js` covering grouping, search by item/plate, primary exclusion, selected preservation, deselection, and max-two rejection.

```js
assert.deepStrictEqual(buildSecondaryIdentityGroups(circles, 1, [3], '').map(row => row.plate), ['教育', '互联网'])
assert.strictEqual(buildSecondaryIdentityGroups(circles, 1, [3], '教师')[0].items[0].id, 2)
assert.deepStrictEqual(toggleSecondaryIdentitySelection([2], 3, 2), { selectedIds: [2, 3], limitReached: false })
assert.deepStrictEqual(toggleSecondaryIdentitySelection([2, 3], 4, 2), { selectedIds: [2, 3], limitReached: true })
```

- [ ] **Step 2: Verify RED**

Run: `node server/selfcheck/secondary-identity-picker.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement minimal picker model**

Implement normalized query matching, stable server order, plate grouping, and immutable selection toggling in `miniprogram/utils/secondaryIdentityPicker.js`.

- [ ] **Step 4: Verify model GREEN**

Run: `node server/selfcheck/secondary-identity-picker.js`

Expected: PASS.

- [ ] **Step 5: Write failing register UI contract assertions**

Assert the main page no longer renders `wx:for="{{secondaryIdentityOptions}}"` directly, and instead contains:

```text
openSecondaryIdentityDrawer
secondaryIdentityDrawerVisible
onSecondaryIdentitySearch
secondaryIdentityGroups
selectedSecondaryIdentities
关闭选择
```

- [ ] **Step 6: Verify UI contract RED**

Run: `node server/selfcheck/secondary-identity-picker.js`

Expected: FAIL because the register page has not adopted the drawer.

- [ ] **Step 7: Integrate drawer UI**

Replace the 40-chip main-page list with selected chips plus an 88rpx entry. Add a bottom drawer with backdrop, search input, selected section, grouped results, empty state, safe-area padding, and one close action. Reuse `secondary_circle_ids` in submit payloads.

- [ ] **Step 8: Verify UI GREEN and syntax**

Run:

```powershell
node server/selfcheck/secondary-identity-picker.js
node server/selfcheck/miniprogram-source-syntax.js
```

Expected: both exit 0.

- [ ] **Step 9: Commit Task 2**

```powershell
git add -- miniprogram/utils/secondaryIdentityPicker.js miniprogram/pages/register/register.js miniprogram/pages/register/register.wxml miniprogram/pages/register/register.wxss server/selfcheck/secondary-identity-picker.js server/package.json
git commit -m "feat(register): simplify secondary identity selection"
```

---

### Task 3: Consistent Custom Tab Bar Icons

**Files:**
- Create: `custom-tab-bar/index.js`
- Create: `custom-tab-bar/index.json`
- Create: `custom-tab-bar/index.wxml`
- Create: `custom-tab-bar/index.wxss`
- Create: `miniprogram/utils/tabBarState.js`
- Create: `server/selfcheck/custom-tab-bar.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/match-list/match-list.js`
- Modify: `miniprogram/pages/profile/profile.js`
- Modify: `server/package.json`

**Interfaces:**
- Produce: `TAB_ITEMS` fixed to index/match-list/profile.
- Produce: `tabIndexForRoute(route): number` returning `-1` for unknown routes.
- Custom component method: `syncForRoute(route)`.

- [ ] **Step 1: Write failing route/model tests**

Create `server/selfcheck/custom-tab-bar.js` asserting exact labels, exact routes, unknown route rejection, `custom: true`, and three icon class names.

- [ ] **Step 2: Verify RED**

Run: `node server/selfcheck/custom-tab-bar.js`

Expected: FAIL because the model/component does not exist and `app.json` is not custom.

- [ ] **Step 3: Implement tab model and custom component**

Use fixed local routes and `wx.switchTab`. Build three CSS-mask icons from data-URI SVG paths, but do not place SVG elements in WXML. Apply default `#B5A5A5`, active `#E8637F`, 100rpx minimum content height, and safe-area inset.

- [ ] **Step 4: Synchronize the three tab pages**

At the start of each existing `onShow`, call a small local helper that obtains `this.getTabBar()` and invokes `syncForRoute('/pages/...')` when available. Preserve all existing loading behavior.

- [ ] **Step 5: Verify GREEN and syntax**

Run:

```powershell
node server/selfcheck/custom-tab-bar.js
node server/selfcheck/miniprogram-source-syntax.js
```

Expected: both exit 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- custom-tab-bar miniprogram/app.json miniprogram/utils/tabBarState.js miniprogram/pages/index/index.js miniprogram/pages/match-list/match-list.js miniprogram/pages/profile/profile.js server/selfcheck/custom-tab-bar.js server/package.json
git commit -m "feat(nav): add WeFinally tab icons"
```

---

### Task 4: Correct Match Reveal View and Snooze Semantics

**Files:**
- Modify: `miniprogram/utils/matchResultReveal.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/components/new-match-reveal/new-match-reveal.wxml`
- Modify: `miniprogram/components/new-match-reveal/new-match-reveal.wxss`
- Modify: `server/selfcheck/qa-registration-match-reveal.js`

**Interfaces:**
- Produce: `createRevealSessionState(): {dismissedMatchIds: string[]}`
- Produce: `dismissForSession(state, matchId): state`
- Extend `shouldRevealLatestMatch` input with `sessionDismissedMatchIds`.

- [ ] **Step 1: Write failing behavior tests**

Assert that session dismiss hides the same match in the current page session but does not equal permanent seen state. Add a source contract asserting `onMatchRevealDismiss` does not call the permanent seen writer and `onMatchRevealView` navigates even if `wx.setStorageSync` throws.

- [ ] **Step 2: Verify RED**

Run: `node server/selfcheck/qa-registration-match-reveal.js`

Expected: FAIL on missing session-state helpers and old dismiss behavior.

- [ ] **Step 3: Implement session dismiss and best-effort seen persistence**

Keep dismissed ids in page instance data for the current mini-program session. Wrap permanent storage in `try/catch`, close the reveal, and always continue to `goMatchDetail()` on view.

- [ ] **Step 4: Refine reveal UI without changing data contracts**

Keep a single rose primary CTA, reduce hard-coded colors to the approved palette, add an explicit close/snooze label, and retain the current date/match summary. No AI-generated claim or emoji is added.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
node server/selfcheck/qa-registration-match-reveal.js
node server/selfcheck/miniprogram-source-syntax.js
```

Expected: both exit 0.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- miniprogram/utils/matchResultReveal.js miniprogram/pages/index/index.js miniprogram/components/new-match-reveal/new-match-reveal.wxml miniprogram/components/new-match-reveal/new-match-reveal.wxss server/selfcheck/qa-registration-match-reveal.js
git commit -m "fix(match): preserve deferred result reveal"
```

---

### Task 5: Admin Conversation and Short-Domain Readiness Evidence

**Files:**
- Create: `project-docs/CLOUDBASE_ADMIN_CONVERSATION_DOMAIN_READINESS.md`
- Modify: `server/selfcheck/backoffice-simple-web-final.js`

**Interfaces:**
- No production API changes.
- Test contract proves Admin Web exposes conversation list, detail, reply, privacy note, and customer-service navigation.

- [ ] **Step 1: Add failing evidence assertions**

Add precise assertions for the visible navigation labels and these endpoint strings:

```text
/admin/agent/conversations
/admin/agent/conversations/:id (constructed path)
/admin/agent/conversations/:id/reply (constructed path)
选择左侧会话后查看真实用户—AI聊天
```

Add an assertion that the lower-role privacy copy remains present.

- [ ] **Step 2: Run and classify RED or already-satisfied behavior**

Run: `node server/selfcheck/backoffice-simple-web-final.js`

Expected: any newly missing assertion fails. If all behavior already exists, record this as characterization rather than manufacture a production change.

- [ ] **Step 3: Write readiness document**

Document the existing CloudBase static URL, the Admin Web conversation capability, required custom-domain ownership/ICP/SSL/CORS steps, and the rule that no DNS/deploy action was performed. Recommend a short candidate such as `admin.<owned-domain>` only as a placeholder pattern, not as an acquired domain.

- [ ] **Step 4: Verify evidence**

Run:

```powershell
node server/selfcheck/backoffice-simple-web-final.js
git diff --check
```

Expected: exit 0 and no whitespace errors.

- [ ] **Step 5: Commit Task 5**

```powershell
git add -- server/selfcheck/backoffice-simple-web-final.js project-docs/CLOUDBASE_ADMIN_CONVERSATION_DOMAIN_READINESS.md
git commit -m "docs(admin): record conversation and domain readiness"
```

---

### Task 6: Full Verification, Documentation, and Independent Framework Review

**Files:**
- Modify: `project-docs/DEVELOPMENT_LOG.md`
- Modify: `project-docs/REAL_DEVICE_REGISTRATION_MATCH_TEST.md`
- Create: `project-docs/review/qa-ui-release-hardening/VERIFICATION.md`
- Create: `project-docs/review/qa-ui-release-hardening/FRAMEWORK_REVIEW.md`

**Interfaces:**
- Verification report records exact commands, exit codes, manual gaps, branch, and final commit.
- Framework review is evidence from a read-only subagent, verified by the main agent.

- [ ] **Step 1: Update operator documentation**

Explain that both QA accounts must complete a new replay after their previous claim, that no history is deleted, how “稍后再看” behaves, and how to operate the simplified identity drawer.

- [ ] **Step 2: Run focused and full regression suite**

Run:

```powershell
node server/selfcheck/qa-registration-match-reveal.js
node server/selfcheck/secondary-identity-picker.js
node server/selfcheck/custom-tab-bar.js
node server/selfcheck/backoffice-simple-web-final.js
node server/selfcheck/miniprogram-source-syntax.js
npm --prefix server run selfcheck:release-guard
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:match-staging-v18
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:safety
npm --prefix server run e2e:wefinally
git diff --check
```

Expected: all commands exit 0; E2E reports 14/14 with live AI smoke explicitly skipped unless separately authorized.

- [ ] **Step 3: Perform local visual/static inspection**

Inspect registration drawer, custom tab bar, and reveal component using available WeChat Developer Tools or local source/preview tooling. Record any unavailable real-device validation as `PENDING_MANUAL`, not PASS.

- [ ] **Step 4: Start the requested read-only framework subagent**

Prompt it to review the final diff and current architecture for component boundaries, dual-backend drift, LangGraph/RAG execution truthfulness, CI/release traceability, indexes, and test gaps. It must not edit files.

- [ ] **Step 5: Main-agent verification of subagent findings**

Check every P0/P1 claim against source or commands. Reject unsupported claims. Save verified findings to `FRAMEWORK_REVIEW.md`, separated into “fix now” and “roadmap”.

- [ ] **Step 6: Commit final evidence**

```powershell
git add -- project-docs/DEVELOPMENT_LOG.md project-docs/REAL_DEVICE_REGISTRATION_MATCH_TEST.md project-docs/review/qa-ui-release-hardening
git commit -m "docs(review): verify QA and UI hardening"
```

- [ ] **Step 7: Confirm final repository state**

Run:

```powershell
git status --short --branch
git log -8 --oneline --decorate
git diff HEAD~1 --check
```

Expected: clean worktree, documented commit series, no push, no merge, no deployment.
