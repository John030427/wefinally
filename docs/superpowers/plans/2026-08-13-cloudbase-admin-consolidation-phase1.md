# CloudBase Admin Consolidation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a CloudBase-only admin experience where stable short user codes identify real users, test accounts are isolated by default, and one user detail combines profile, membership, orders, matches, AI conversations, human tickets, coordination, and notifications.

**Architecture:** Add a focused `userBackofficeService` beside the existing Agent backoffice service. Cloud function routes delegate user, order, match, and dashboard reads to this service; Agent conversation DTOs receive the same user identity/context contract. The existing static admin page remains the single UI and enables migrated pages only after their CloudBase APIs pass contract and browser tests.

**Tech Stack:** Node.js 18, CommonJS, `wx-server-sdk` CloudBase NoSQL, existing native HTML/CSS/JavaScript admin UI, self-contained Node selfchecks, CloudBase MCP for resource inspection and deployment.

## Global Constraints

- Work only in `D:\wefinal\.worktrees\wefinally-ai-agent`.
- Preserve all existing uncommitted and concurrent changes; never reset, clean, restore, delete, overwrite, or include them in a task commit.
- Keep existing internal numeric `user.id` values unchanged.
- Persist official support codes as `WF-000001`; display test accounts as `TEST-000118` without merging them into official users.
- Do not invent nicknames. When profile identity is incomplete, display the support code plus available gender/city or `资料未完善`.
- Different user IDs or OpenIDs are never automatically merged.
- CloudBase is the only production data source; CloudBase operations and deployment use MCP only.
- Do not deploy the Mini Program, modify match outcomes, delete test history, handle real funds, or change production data beyond the explicitly reviewed support-code backfill.
- `customer_service` may read service-relevant summaries and reply, but may not edit core user data or export it; `super_admin` retains mutation authority.
- Every production-code change starts with a failing selfcheck, then the minimum implementation, proportional regression checks, diff review, and a commit containing only that task's files.

## File Structure

- Create `miniprogram/cloudfunctions/api/agent/userIdentity.js`: short-code validation, display-label formatting, test-account classification, and sensitive-field projection.
- Create `miniprogram/cloudfunctions/api/agent/userBackofficeService.js`: user, dashboard, order, and match aggregation with role-aware DTOs and audit writes.
- Modify `miniprogram/cloudfunctions/api/lib/db.js`: one transaction-backed `ensureUserSupportCode` primitive.
- Modify `miniprogram/cloudfunctions/api/handlers/backoffice.js`: route the first-phase CloudBase admin endpoints and preserve role enforcement.
- Modify `miniprogram/cloudfunctions/api/agent/backofficeService.js`: enrich tickets/conversations with shared user context and exclude tests by default.
- Modify `server/public/admin/index.html`: open migrated CloudBase pages, use `support_code`, show the combined user panel, and remove duplicate service navigation.
- Create `server/selfcheck/admin-user-identity.js`: pure identity-policy tests.
- Create `server/selfcheck/admin-user-cloud-service.js`: fake-dependency aggregation, permission, audit, and route-contract tests.
- Create `server/selfcheck/admin-customer-context.js`: Agent list/detail filtering and user-context regression tests.
- Create `server/selfcheck/admin-cloud-consolidation-ui.js`: static UI contract assertions without touching the dirty existing browser fixture.
- Create `server/selfcheck/admin-cloud-consolidation-browser-fixture.js`: isolated HTTP fixture for users, orders, matches, and conversation detail.
- Create `server/selfcheck/admin-cloud-consolidation-browser.js`: real browser smoke flow against the isolated fixture.
- Modify `server/package.json`: expose focused phase-one selfcheck commands.

---

### Task 1: Stable User Identity Policy

**Files:**
- Create: `server/selfcheck/admin-user-identity.js`
- Create: `miniprogram/cloudfunctions/api/agent/userIdentity.js`
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `isTestUser(user): boolean`
- Produces: `supportCodeFor(user): string`
- Produces: `userLabel(user): string`
- Produces: `projectUserIdentity(user, options): object`
- Produces: `db.ensureUserSupportCode(userDoc): Promise<string>`

- [ ] **Step 1: Write the failing identity selfcheck**

Create assertions that official users require a persisted `WF-000001` code, `dev_`/fixture accounts render as `TEST-000118`, labels do not invent nicknames, customer-service projection omits `openid` and phone, and invalid/duplicate-format codes are rejected.

```js
const assert = require('assert')
const { isTestUser, supportCodeFor, userLabel, projectUserIdentity } = require('../../miniprogram/cloudfunctions/api/agent/userIdentity')

const official = { id: 1783497710464352, support_code: 'WF-000001', gender: 2, city: '深圳', openid: 'om8-real', phone: '13800000000' }
const legacy = { id: 118, openid: 'dev_wefinally_local_openid', gender: 1, city: '深圳' }
assert.strictEqual(isTestUser(official), false)
assert.strictEqual(isTestUser(legacy), true)
assert.strictEqual(supportCodeFor(official), 'WF-000001')
assert.strictEqual(supportCodeFor(legacy), 'TEST-000118')
assert.strictEqual(userLabel(official), 'WF-000001 · 女 · 深圳')
assert.strictEqual(userLabel({ id: 9, support_code: 'WF-000009' }), 'WF-000009 · 资料未完善')
const serviceView = projectUserIdentity(official, { includeSensitive: false })
assert.strictEqual(serviceView.openid, undefined)
assert.strictEqual(serviceView.phone, undefined)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node server/selfcheck/admin-user-identity.js`

Expected: FAIL with `Cannot find module .../userIdentity`.

- [ ] **Step 3: Implement the pure identity policy**

Implement anchored validation `/^WF-\d{6}$/`, explicit test signals (`is_test_fixture`, `ab_test_owner_user_id`, and development/test OpenID prefixes), Chinese gender labels, and role-aware projections. Never derive an official six-digit code from the long internal ID.

- [ ] **Step 4: Add transaction-backed support-code allocation**

Add `ensureUserSupportCode(userDoc)` in `db.js`. Inside `db.runTransaction`, reread `users/<_id>`, return an existing valid code, atomically increment `system_counters/user_support_code`, format `WF-${seq.padStart(6, '0')}`, and update the user document. Test accounts return their `TEST-` label without consuming the official counter. Reject a sequence above `999999`.

Add `"selfcheck:admin-user-identity": "node selfcheck/admin-user-identity.js"` to `server/package.json`.

- [ ] **Step 5: Verify GREEN and regressions**

Run:

```powershell
node server/selfcheck/admin-user-identity.js
node server/selfcheck/cloudbase-migration.js
node --check miniprogram/cloudfunctions/api/agent/userIdentity.js
node --check miniprogram/cloudfunctions/api/lib/db.js
```

Expected: all PASS / exit 0.

- [ ] **Step 6: Review and commit only Task 1 files**

```powershell
git diff --check -- server/selfcheck/admin-user-identity.js miniprogram/cloudfunctions/api/agent/userIdentity.js miniprogram/cloudfunctions/api/lib/db.js server/package.json
git add -- server/selfcheck/admin-user-identity.js miniprogram/cloudfunctions/api/agent/userIdentity.js miniprogram/cloudfunctions/api/lib/db.js server/package.json
git commit -m "feat(admin): add stable user support identities"
```

### Task 2: CloudBase User, Order, Match, and Dashboard Service

**Files:**
- Create: `server/selfcheck/admin-user-cloud-service.js`
- Create: `miniprogram/cloudfunctions/api/agent/userBackofficeService.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/backoffice.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `db.ensureUserSupportCode`, `projectUserIdentity`, existing logical collection names.
- Produces: `createUserBackofficeService(deps)` with `dashboard(actor)`, `listUsers(actor, filters)`, `userDetail(actor, id)`, `updateUser(actor, id, input)`, `listOrders(actor, filters)`, `listMatches(actor, filters)`, and `matchDetail(actor, id)`.
- Produces: `backfillSupportCodes(actor, input)` with `{ dry_run: true }` preview and `{ confirm: true, user_ids: [...] }` execution.
- Produces routes: `GET /api/admin/dashboard`, `GET|PUT /api/admin/users/:id`, `GET /api/admin/users`, `POST /api/admin/users/support-codes/backfill`, `GET /api/admin/orders`, `GET /api/admin/matches`, and `GET /api/admin/matches/:id`.

- [ ] **Step 1: Write the failing service and route-contract selfcheck**

Use in-memory tables for `user`, `user_match_setting`, `user_match_log`, `user_order`, `member_application`, `partner`, `partner_referral_attribution`, `agent_session`, `agent_human_ticket`, and `partner_user_audit_log`. Assert that:

```js
const detail = await service.userDetail(customerService, 7)
assert.strictEqual(detail.user.support_code, 'WF-000007')
assert.strictEqual(detail.user.openid, undefined)
assert.strictEqual(detail.orders.length, 1)
assert.strictEqual(detail.matches.length, 1)
assert.strictEqual(detail.conversations.length, 2)
assert.strictEqual(detail.tickets.length, 1)
assert.strictEqual(audits.at(-1).action, 'view_user_aggregate')
await assert.rejects(() => service.updateUser(customerService, 7, { status: 2 }), /无权/)
await service.updateUser(superAdmin, 7, { status: 2 })
```

Also inspect `backoffice.js` for every exact route string.

- [ ] **Step 2: Run the test and verify RED**

Run: `node server/selfcheck/admin-user-cloud-service.js`

Expected: FAIL because `userBackofficeService` and routes do not exist.

- [ ] **Step 3: Implement role-aware aggregation DTOs**

Return bounded lists and explicit fields. For `customer_service`, omit raw OpenID, phone, profile mutation fields, report internals, payment transaction identifiers, and AI prompt/debug payloads. For `super_admin`, return required operational fields but never passwords or tokens. Missing related records produce empty arrays.

`backfillSupportCodes` is super-admin-only. Dry-run returns the exact official user IDs missing codes without writing. Confirmed execution rejects any ID not present in the dry-run set supplied by the caller, calls `ensureUserSupportCode` once per reviewed ID, and returns `{ user_id, support_code }` rows. Ordinary GET requests must not allocate codes as a hidden side effect.

- [ ] **Step 4: Implement routes and 404 semantics**

Instantiate the service lazily like `agentService()`. Convert service errors carrying `code = 404` to HTTP 404; preserve 401 for invalid actors and 403-style permission failures. Parse `page`, `pageSize`, `keyword`, `status`, and `include_test=1` with bounded values.

Add `"selfcheck:admin-user-cloud": "node selfcheck/admin-user-cloud-service.js"` to `server/package.json`.

- [ ] **Step 5: Verify GREEN and regressions**

Run:

```powershell
node server/selfcheck/admin-user-cloud-service.js
node server/selfcheck/backoffice-token.js
node server/selfcheck/member-application-cloud.js
node --check miniprogram/cloudfunctions/api/agent/userBackofficeService.js
node --check miniprogram/cloudfunctions/api/handlers/backoffice.js
```

Expected: all PASS / exit 0.

- [ ] **Step 6: Review and commit only Task 2 files**

```powershell
git diff --check -- server/selfcheck/admin-user-cloud-service.js miniprogram/cloudfunctions/api/agent/userBackofficeService.js miniprogram/cloudfunctions/api/handlers/backoffice.js server/package.json
git add -- server/selfcheck/admin-user-cloud-service.js miniprogram/cloudfunctions/api/agent/userBackofficeService.js miniprogram/cloudfunctions/api/handlers/backoffice.js server/package.json
git commit -m "feat(admin): add cloud user business APIs"
```

### Task 3: Merge User Context into Agent Conversations

**Files:**
- Create: `server/selfcheck/admin-customer-context.js`
- Modify: `miniprogram/cloudfunctions/api/agent/backofficeService.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/backoffice.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: identity projection and `userBackofficeService.userContext(actor, userId)`.
- Changes: `listConversations(actor, filters)` and `listTickets(actor, filters)` accept `include_test` and return `user` identity summaries.
- Changes: `conversationDetail` and `ticketDetail` return `user_context` containing profile, membership, order, match, coordination, and support-history summaries.

- [ ] **Step 1: Write the failing Agent-context selfcheck**

Seed three sessions for official user 7 and one session for test user 118. Assert default results group/display all three official sessions under `WF-000007`, exclude 118, and include it only for `include_test=1` as `TEST-000118`. Assert conversation detail contains the shared `user_context` and writes both conversation and sensitive aggregate-view audits without message contents.

- [ ] **Step 2: Run the test and verify RED**

Run: `node server/selfcheck/admin-customer-context.js`

Expected: FAIL because current DTOs only return `WF-U-xxxxxx` and do not filter or aggregate users.

- [ ] **Step 3: Inject the user-context dependency**

Change `createAgentBackofficeService(deps, options = {})` to require `options.userBackoffice` for enrichment while preserving current callers during migration. Hydrate distinct user IDs once per list request, attach `user`, and apply test filtering before text search.

- [ ] **Step 4: Add detail aggregation without exposing secrets**

Call `userBackoffice.userContext(actor, session.user_id)` from both detail methods. Keep message/timeline ordering unchanged and preserve reply/close behavior. Customer service receives the restricted projection; super admin receives the operational projection.

Add `"selfcheck:admin-customer-context": "node selfcheck/admin-customer-context.js"` to `server/package.json`.

- [ ] **Step 5: Verify GREEN and regressions**

Run:

```powershell
node server/selfcheck/admin-customer-context.js
node server/selfcheck/agent-backoffice.js
node server/selfcheck/agent-operations.js
node --check miniprogram/cloudfunctions/api/agent/backofficeService.js
```

Expected: all PASS / exit 0.

- [ ] **Step 6: Review and commit only Task 3 files**

```powershell
git diff --check -- server/selfcheck/admin-customer-context.js miniprogram/cloudfunctions/api/agent/backofficeService.js miniprogram/cloudfunctions/api/handlers/backoffice.js server/package.json
git add -- server/selfcheck/admin-customer-context.js miniprogram/cloudfunctions/api/agent/backofficeService.js miniprogram/cloudfunctions/api/handlers/backoffice.js server/package.json
git commit -m "feat(admin): merge user context into service records"
```

### Task 4: Consolidated CloudBase Admin UI

**Files:**
- Create: `server/selfcheck/admin-cloud-consolidation-ui.js`
- Create: `server/selfcheck/admin-cloud-consolidation-browser-fixture.js`
- Create: `server/selfcheck/admin-cloud-consolidation-browser.js`
- Modify: `server/public/admin/index.html`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: Task 2 admin APIs and Task 3 `user` / `user_context` DTOs.
- Produces: Cloud-only navigation for `dashboard`, `service`, `users`, `members`, `matches`, `partners`, `orders`, and `knowledge`.
- Produces: `renderUserIdentity`, `openUserContext`, and an “包含测试数据” filter shared by users and service queues.

- [ ] **Step 1: Write the failing static UI contract**

Assert the Cloud-only page list contains the newly migrated pages, service detail uses `user_context`, identity rendering never falls back to a fabricated nickname, and duplicate `chat` / `handoff` navigation is hidden in Cloud-only mode.

- [ ] **Step 2: Run the static test and verify RED**

Run: `node server/selfcheck/admin-cloud-consolidation-ui.js`

Expected: FAIL because `CLOUD_ONLY_PAGES` still contains only four pages and the context pane lacks the aggregate DTO.

- [ ] **Step 3: Implement the minimum UI integration**

Reuse current page functions and switch their Cloud-only data calls to the migrated API. Render `support_code · gender_text · city`, a visible test badge, membership/VIP, partner attribution, recent orders/matches, conversation count, tickets, coordination, and notifications in the existing detail modal/context column. Put original numeric ID/OpenID behind the super-admin detail section only.

- [ ] **Step 4: Build an isolated browser fixture and smoke flow**

The fixture serves the real admin HTML and deterministic API responses for one official user with three conversations and one test user with one conversation. The browser smoke must log in, verify the official code appears across users/service/orders/matches, open a conversation, verify combined context, toggle test data, verify `TEST-000118`, send an artificial reply, and confirm the reply appears.

Add `"selfcheck:admin-cloud-ui": "node selfcheck/admin-cloud-consolidation-ui.js && node selfcheck/admin-cloud-consolidation-browser.js"` to `server/package.json`.

- [ ] **Step 5: Run browser verification and focused regressions**

Run:

```powershell
node server/selfcheck/admin-cloud-consolidation-ui.js
node server/selfcheck/admin-cloud-consolidation-browser.js
node server/selfcheck/cloudbase-admin-connection.js
node server/selfcheck/agent-backoffice.js
node --check server/public/admin/index.html
```

For the HTML syntax check, if `node --check` rejects the `.html` extension, extract only the inline script to a temporary file under the system temp directory and run `node --check` on that temporary script; do not create a repository file.

Expected: all applicable checks PASS and browser flow completes without console errors.

- [ ] **Step 6: Review and commit only Task 4 files**

```powershell
git diff --check -- server/selfcheck/admin-cloud-consolidation-ui.js server/selfcheck/admin-cloud-consolidation-browser-fixture.js server/selfcheck/admin-cloud-consolidation-browser.js server/public/admin/index.html server/package.json
git add -- server/selfcheck/admin-cloud-consolidation-ui.js server/selfcheck/admin-cloud-consolidation-browser-fixture.js server/selfcheck/admin-cloud-consolidation-browser.js server/public/admin/index.html server/package.json
git commit -m "feat(admin): consolidate cloud user service workspace"
```

### Task 5: CloudBase Resource Preparation, Deployment, and Online Acceptance

**Files:**
- Modify only if verification reveals a documented mismatch: `README.md`
- No production code change is allowed during deployment; any code correction returns to a new RED/GREEN task and commit.

**Interfaces:**
- Consumes: committed phase-one cloud function and admin static files.
- Produces: deployed `api` function and updated `/admin/` hosting content in environment `cloud1-d4gy8l52g08bba326`.

- [ ] **Step 1: Run the mandatory pre-deployment suite**

Run the six handoff selfcheck groups plus the focused phase-one checks. Stop on the first real failure and fix it through a new failing test rather than bypassing it.

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
npm --prefix server run selfcheck:admin-user-identity
npm --prefix server run selfcheck:admin-user-cloud
npm --prefix server run selfcheck:admin-customer-context
npm --prefix server run selfcheck:admin-cloud-ui
```

- [ ] **Step 2: Inspect CloudBase resources through MCP**

Use MCP to confirm environment `cloud1-d4gy8l52g08bba326`, the `users`, `system_counters`, audit, order, match, session, message, ticket, coordination, and notification collections, current `api` function state, and hosting state. No console or CLI mutation is permitted.

- [ ] **Step 3: Prepare the support-code counter before frontend deployment**

Through MCP, read `system_counters/user_support_code`. If absent, insert exactly one document with `_id = user_support_code`, `seq = 0`, and timestamps. Re-read it and record the result. Do not backfill users yet.

- [ ] **Step 4: Deploy backend through MCP and run API acceptance**

Deploy the committed `api` function with `manageFunctions`. Poll until Active. Log in as `Grace`, then verify dashboard, users, one user detail, orders, matches, three official conversations under one user code, default test exclusion, explicit test inclusion, customer-service field restrictions, and artificial test-only reply behavior.

- [ ] **Step 5: Perform reviewed support-code backfill**

Call `POST /api/admin/users/support-codes/backfill` first with `{ "dry_run": true }`. Review its exact official user IDs, then call it with `{ "confirm": true, "user_ids": [...] }` using precisely that reviewed list. After write, re-read each affected document through MCP. Do not touch user `118` except to verify it displays `TEST-000118` without a persisted official code.

- [ ] **Step 6: Deploy static admin through MCP and verify online UI**

Upload only `server/public/admin/index.html` to the existing `admin/index.html` hosting path using `manageHosting`. Open the cache-busted admin URL, log in, exercise the same browser flow as Task 4, and confirm the page makes no requests to localhost or the legacy MySQL server.

- [ ] **Step 7: Close-out review**

Run the CloudBase code-review rules applicable to auth, NoSQL, cloud functions, and Web UI. Record deployed URLs, function/hosting versions, online verification evidence, and any remaining second/third-batch modules. If `README.md` required an update, review, validate, and commit only that file with `docs(admin): record phase one cloud deployment`.

## Plan Self-Review Result

- Spec coverage: all phase-one identity, test isolation, aggregation, permission, audit, UI, deployment, and online acceptance requirements map to Tasks 1–5.
- Deferred scope is explicit: withdrawals, marriage reports, cancellation/divorce, public stats, privacy logs, whitelist, export, and system logs remain in later plans.
- Placeholder scan: no unresolved markers or vague implementation steps remain.
- Interface consistency: all later tasks consume `projectUserIdentity`, `ensureUserSupportCode`, `createUserBackofficeService`, and `user_context` using the same names defined above.
