# Controlled Bilateral Date LangGraph E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute a production-safe QA scenario that proves two isolated users can complete bilateral AI date coordination through real CloudBase data, DeepSeek intent parsing, LangGraph orchestration, versioned tools and transactional confirmation, while support staff view A/B conversations side by side.

**Architecture:** A super-admin-only scenario service advances one durable step per request and reuses existing date coordination, Agent, worker and confirmation services instead of mutating final state directly. Date coordinator turns call `agent-graph` with privacy-safe structured state while DeepSeek continues to parse natural-language changes. The backoffice conversation detail endpoint adds a paired projection keyed by `coordination_id`.

**Tech Stack:** Node.js CommonJS CloudBase Event Function, CloudBase NoSQL, TypeScript LangGraph function, native HTML/CSS/JavaScript admin frontend, Node selfchecks, CloudBase MCP.

## Global Constraints

- Work only in `D:\wefinal\.worktrees\wefinally-ai-agent`.
- Preserve and never stage unrelated dirty files.
- CloudBase resource and deployment operations use MCP only.
- QA users must have `account_mode=internal_qa`, `profile_origin=controlled_date_scenario`, `is_test_fixture=1`, `formal_match_hidden=1`, and a unique `controlled_scenario_run_id`.
- Scenario APIs require `super_admin`; ordinary customer service and auditor roles may only view paired conversations according to existing permissions.
- Never set a coordination directly to `arranged`; only the existing same-proposal, same-version transaction may do so.
- Do not send SMS, create payments, upload a mini program, or notify real users.
- Each changed-file batch gets a RED/GREEN test cycle, diff review, proportionate verification and its own commit.

---

### Task 1: Characterize the missing production path

**Files:**
- Create: `server/selfcheck/controlled-date-langgraph-e2e.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `createControlledDateScenarioService(deps, services)` (not yet implemented).
- Produces: executable behavioral contract for scenario creation, step advancement and pass assertions.

- [ ] **Step 1: Write the failing scenario test**

Create an in-memory dependency adapter and assert that `createRun()` produces two hidden QA users, two reciprocal match logs, one coordination and two independent sessions. Assert successive `advanceRun()` calls save exactly two initial applications, produce a LangGraph run, apply one confirmed patch, generate a current proposal, confirm both sides and finish only when coordination status is `arranged`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node server/selfcheck/controlled-date-langgraph-e2e.js
```

Expected: FAIL because `controlledDateScenarioService` does not exist.

- [ ] **Step 3: Register the selfcheck**

Append `node selfcheck/controlled-date-langgraph-e2e.js` to `selfcheck:agent` without changing other scripts.

- [ ] **Step 4: Review and commit the RED contract**

```powershell
git add -- server/selfcheck/controlled-date-langgraph-e2e.js server/package.json
git commit -m "test(date): characterize controlled langgraph e2e"
```

### Task 2: Build privacy-safe date graph state and wire real LangGraph runs

**Files:**
- Create: `miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/agent.js`
- Test: `server/selfcheck/agent-chat.js`
- Test: `server/selfcheck/langgraph-client.js`

**Interfaces:**
- Produces: `buildDateGraphInput({ coordination, applications, confirmations, user, session, message, secret })`.
- Consumes: `runLangGraphStep`, `createThreadId`, `createActorRef` and existing `invokeGraphFunction` dependency.

- [ ] **Step 1: Add failing graph-wiring assertions**

Assert a date coordinator turn invokes `agent-graph` with `mode=date_coordination`, a stable session thread, A/B party marker, current version and only structured preferences. Assert neither side's `other_requirements`, `share_message`, phone, OPENID nor raw chat appears in the graph payload. Assert a successful graph call writes `agent_run.provider=langgraph`.

- [ ] **Step 2: Verify RED**

```powershell
node server/selfcheck/agent-chat.js
```

Expected: FAIL because date coordinator turns do not invoke LangGraph.

- [ ] **Step 3: Implement the state adapter**

Map date applications as follows:

```js
{
  dateWindows: availability.flatMap(row => row.periods.map(period => `${row.date}:${period}`)),
  regions: areas,
  venueTypes: activities,
  durationMinutes: durationToMinutes(duration),
  budgetBand: budgetToBand(budget),
  notes: ''
}
```

Read the latest application for each participant at or below the current coordination version. Derive confirmation flags only from same-version `confirm` records.

- [ ] **Step 4: Invoke graph without bypassing existing tools**

For enabled date coordinator sessions, call `runLangGraphStep` before the legacy DeepSeek decision, store a LangGraph run, and retain DeepSeek for natural-language intent and patch preview generation. Graph errors must be recorded with a typed error code; ordinary production turns may fall back, but the controlled scenario pass predicate requires at least one completed LangGraph run.

- [ ] **Step 5: Verify GREEN and adjacent behavior**

```powershell
node server/selfcheck/langgraph-client.js
node server/selfcheck/agent-chat.js
npm --prefix server run selfcheck:agent
```

- [ ] **Step 6: Review and commit**

```powershell
git add -- miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState.js miniprogram/cloudfunctions/api/handlers/agent.js server/selfcheck/agent-chat.js server/selfcheck/langgraph-client.js
git commit -m "feat(agent): route date coordination through langgraph"
```

### Task 3: Implement durable controlled scenario service

**Files:**
- Create: `miniprogram/cloudfunctions/api/agent/controlledDateScenarioService.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collections.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/backoffice.js`
- Test: `server/selfcheck/controlled-date-langgraph-e2e.js`
- Test: `server/selfcheck/agent-route-contract.js`

**Interfaces:**
- Produces: `createRun(actor, input)`, `advanceRun(actor, runId)`, `runDetail(actor, runId)`.
- Persists: `controlled_date_scenario_runs` documents with `run_id`, `step`, `status`, entity IDs, assertions, `failed_step`, `error_code`, lease and timestamps.

- [ ] **Step 1: Add failing role, idempotency and route tests**

Assert only `super_admin` can create or advance, retrying a completed step creates no duplicate users/applications/sessions, and the three specified admin routes exist.

- [ ] **Step 2: Verify RED**

```powershell
node server/selfcheck/controlled-date-langgraph-e2e.js
node server/selfcheck/agent-route-contract.js
```

- [ ] **Step 3: Implement idempotent creation**

Create users with hidden QA markers, approved/VIP test eligibility and no real OPENID/phone. Create reciprocal match logs and a coordination only through existing service logic. Store every created numeric ID in the run document.

- [ ] **Step 4: Implement one-step advancement**

Use these exact steps:

```text
created
applications_submitted
first_proposal
a_patch_preview
a_patch_applied
revised_proposal
confirmations_submitted
passed
```

At `a_patch_preview`, send A's natural-language request through the real Agent handler. At `a_patch_applied`, confirm the pending preview through the Agent handler. At proposal steps, call the existing coordination worker. At confirmations, call the existing transactional confirmation handler for A and B against the same active proposal/version.

- [ ] **Step 5: Enforce the pass predicate**

`passed` requires all of:

```js
coordination.status === 'arranged'
langgraphRuns >= 1
patchToolCalls >= 1
applicationCountAtVersion1 === 2
currentProposalConfirmations === 2
formalPoolEligibleUsers === 0
```

- [ ] **Step 6: Verify GREEN**

```powershell
node server/selfcheck/controlled-date-langgraph-e2e.js
node server/selfcheck/agent-route-contract.js
npm --prefix server run selfcheck:agent
```

- [ ] **Step 7: Review and commit**

```powershell
git add -- miniprogram/cloudfunctions/api/agent/controlledDateScenarioService.js miniprogram/cloudfunctions/api/lib/collections.js miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js miniprogram/cloudfunctions/api/handlers/backoffice.js server/selfcheck/controlled-date-langgraph-e2e.js server/selfcheck/agent-route-contract.js
git commit -m "feat(date): add controlled bilateral e2e runner"
```

### Task 4: Add paired A/B backoffice projection

**Files:**
- Modify: `miniprogram/cloudfunctions/api/agent/backofficeService.js`
- Test: `server/selfcheck/agent-backoffice.js`

**Interfaces:**
- Extends `conversationDetail()` with `paired_conversation` when the session has a coordination.
- `paired_conversation.sides.a|b` each contains `user`, `session`, `messages`, `runs`; shared coordination events remain outside either private side.

- [ ] **Step 1: Add failing paired projection tests**

Assert A and B sessions are selected by `coordination_id` plus participant user ID, side order is stable, messages never cross sides, and every paired view writes an audit log containing both session IDs and the coordination ID.

- [ ] **Step 2: Verify RED**

```powershell
node server/selfcheck/agent-backoffice.js
```

- [ ] **Step 3: Implement paired projection**

Reuse existing DTOs. Return `paired_conversation=null` for unrelated sessions and preserve all current response fields for backwards compatibility.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
node server/selfcheck/agent-backoffice.js
npm --prefix server run selfcheck:agent
git add -- miniprogram/cloudfunctions/api/agent/backofficeService.js server/selfcheck/agent-backoffice.js
git commit -m "feat(admin): expose paired coordination conversations"
```

### Task 5: Render the support workbench as A/B columns

**Files:**
- Modify: `server/public/admin/index.html`
- Create: `server/selfcheck/paired-conversation-admin-ui.js`
- Create: `server/selfcheck/paired-conversation-browser-fixture.js`
- Create: `server/selfcheck/paired-conversation-browser.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `detail.paired_conversation` from Task 4.
- Produces: desktop A/B columns and mobile A-then-B stacked layout.

- [ ] **Step 1: Add failing UI contract**

Assert the admin page contains paired layout classes, labels “A 用户对话” and “B 用户对话”, renders each side from its own message array, preserves the shared coordination header, and binds manual reply to the selected session only.

- [ ] **Step 2: Verify RED**

```powershell
node server/selfcheck/paired-conversation-admin-ui.js
```

- [ ] **Step 3: Implement the minimal existing-brand layout**

Add `.service-paired`, `.service-side`, `.service-side-head`, and responsive stacking under the existing 768px breakpoint. Do not alter navigation, auth, colors or typography.

- [ ] **Step 4: Verify browser behavior**

Create a fixture that serves the existing admin HTML and returns one coordination with separate A/B session timelines. In `paired-conversation-browser.js`, launch the fixture on loopback, open the service workbench with Playwright, select the paired coordination, and assert both support codes, both message columns, independent scroll containers and an empty browser console error list.

```powershell
node server/selfcheck/paired-conversation-browser.js
```

- [ ] **Step 5: Verify and commit**

```powershell
node server/selfcheck/paired-conversation-admin-ui.js
node server/selfcheck/paired-conversation-browser.js
npm --prefix server run selfcheck:agent
git add -- server/public/admin/index.html server/selfcheck/paired-conversation-admin-ui.js server/selfcheck/paired-conversation-browser-fixture.js server/selfcheck/paired-conversation-browser.js server/package.json
git commit -m "feat(admin): compare bilateral agent conversations"
```

### Task 6: Prepare CloudBase resources and deploy

**Resources:**
- Create collection: `controlled_date_scenario_runs`.
- Create unique index: `controlled_date_scenario_runs.run_id`.
- Create queue index: `controlled_date_scenario_runs.status + update_time`.
- Update function: `api` through CloudBase MCP.
- Update existing admin static hosting only after locating its current deployment target.

- [ ] **Step 1: Run the release gate**

Run all six server selfcheck groups, mini program syntax checks and `git diff --check`. Confirm `agent-graph` and `api` are Active/Available and required LangGraph environment keys are present without printing secret values.

- [ ] **Step 2: Prepare database resources through MCP**

Create the collection and indexes idempotently. Do not modify any existing user, match, payment or production coordination.

- [ ] **Step 3: Preserve rollback state and deploy API through MCP**

Capture the current `api` download URL, update only function code, wait for Active/Available, invoke `ping`, and invoke `report-worker` once to verify worker integration.

- [ ] **Step 4: Deploy the existing admin site through its established CloudBase hosting path**

Do not create a new site or domain. Verify the deployed HTML contains the paired layout marker and that the existing admin login still works.

### Task 7: Execute the real controlled scenario and report evidence

**Files:**
- Create: `project-docs/WORK_REPORT_2026-08-15_CONTROLLED_DATE_LANGGRAPH_E2E.md`

- [ ] **Step 1: Authenticate to the existing admin API without exposing the token**

Use the configured admin account only for the protected scenario endpoints. Never print credentials or bearer tokens.

- [ ] **Step 2: Create and advance the run**

Create one run, then call `advance` until `passed` or a typed failure occurs. Stop on failure and report the exact failed step; never patch database state around it.

- [ ] **Step 3: Verify CloudBase evidence read-only**

Confirm two hidden QA users, reciprocal matches, exactly two v1 applications, separate A/B sessions, at least one completed LangGraph run, a confirmed patch, versioned proposals, two same-version confirmations and final `arranged`.

- [ ] **Step 4: Verify the paired backoffice view**

Open either session in the deployed admin workbench and confirm left/right timelines correspond to the correct support codes and shared coordination ID.

- [ ] **Step 5: Write and commit the report**

Include run ID, support codes, coordination ref, version history, safe LangGraph evidence, final assertions, deployed function timestamp, validation commands and remaining true-device gaps.

```powershell
git add -- project-docs/WORK_REPORT_2026-08-15_CONTROLLED_DATE_LANGGRAPH_E2E.md
git commit -m "docs(date): report controlled langgraph e2e"
```
