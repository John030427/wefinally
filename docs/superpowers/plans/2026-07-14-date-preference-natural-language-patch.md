# Date Preference Natural Language Patch Implementation Plan

> **For agentic workers:** Execute inline with test-first checkpoints. Do not commit or push this task.

**Goal:** Let either date-coordination participant request preference changes in natural language, preview a versioned patch, confirm it once, and automatically replan and notify the other participant without leaking private input.

**Architecture:** Keep model output advisory and provider-neutral. A deterministic policy validates intent and patch fields; a CloudBase service owns authorization, optimistic locking, idempotency, proposal invalidation, confirmation reset, overlap recomputation, events, jobs, and the partner's separate agent-session message. Existing date coordination and chat pages consume public DTOs only.

**Tech Stack:** Node.js CommonJS, CloudBase `wx-server-sdk`, native WeChat Mini Program, self-contained Node selfchecks.

## Global Constraints

- Preserve the current initiator-first form flow and legacy-record compatibility.
- WeFinally-generated coordination/session/message/run identifiers remain canonical.
- Never expose the other participant's raw message, reason, or complete application.
- Never execute a mutation before explicit patch confirmation.
- Do not print or hard-code provider keys.
- Do not commit or push.

---

### Task 1: Patch policy and behavioral selfcheck

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy.js`
- Create: `server/selfcheck/date-application-patch.js`
- Modify: `server/package.json`

- [ ] Write failing tests for explicit-vs-consultative intent, field schema, preview, and shareable summaries.
- [ ] Run the selfcheck and verify it fails because the policy module is absent.
- [ ] Implement the smallest policy surface needed by the tests.
- [ ] Run the selfcheck and verify it passes.

### Task 2: Versioned patch service

**Files:**
- Create: `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collections.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/route.js`
- Modify: `server/selfcheck/date-application-patch.js`

- [ ] Add failing service tests for ownership isolation, version conflict, idempotent confirmation, old-proposal invalidation, confirmation reset, arranged-to-replanning, and partner redaction.
- [ ] Implement create/preview/confirm endpoints with backend-generated IDs and whitelist validation.
- [ ] Confirm changes through one guarded service path, increment version, write event/job, and recompute current overlap.
- [ ] Run the focused selfcheck until green.

### Task 3: Date-coordinator Agent integration and context

**Files:**
- Modify: `miniprogram/cloudfunctions/api/agent/provider.js`
- Modify: `miniprogram/cloudfunctions/api/agent/context.js`
- Modify: `miniprogram/cloudfunctions/api/agent/toolRegistry.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/agent.js`
- Modify: `server/selfcheck/agent-chat.js`
- Modify: `server/selfcheck/agent-core.js`

- [ ] Add failing tests for strict decision shape, last four turns, structured summary, own application only, allowed tools, and patch-card response.
- [ ] Integrate model decision validation with a conservative deterministic fallback for supported Chinese edit phrases.
- [ ] Store run/tool audit records and update structured session summaries without inferred profile facts.
- [ ] Run Agent selfchecks until green.

### Task 4: Partner notification and UI

**Files:**
- Modify: `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`
- Modify: `miniprogram/pages/chat/chat.js`
- Modify: `miniprogram/pages/chat/chat.wxml`
- Modify: `miniprogram/pages/chat/chat.wxss`
- Modify: `miniprogram/pages/date-coordination/date-coordination.js`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxml`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxss`
- Modify: `server/selfcheck/agent-ui.js`

- [ ] Add failing UI contract checks for preview cards, confirm/cancel actions, and the simplified timeline.
- [ ] Render the pink card-style preview and refresh the coordination after confirmation.
- [ ] Write the redacted assistant message only into B's independent date-coordinator session.
- [ ] Run focused UI and partner-redaction checks until green.

### Task 5: Verification and deployment

**Files:**
- Modify: `project-docs/DEVELOPMENT_LOG.md`
- Modify: `project-docs/AI_AGENT_CLOUDBASE_DEPLOYMENT_2026-07-12.md`

- [ ] Run `npm run selfcheck:agent` and `npm run selfcheck:ai-report`.
- [ ] Run syntax checks for all changed JavaScript and `git diff --check`.
- [ ] Compile and inspect the key pages in WeChat Developer Tools.
- [ ] Deploy the `api` cloud function to the configured CloudBase test environment and record the timestamp.
- [ ] Report exact collection/index requirements, verification evidence, remaining gaps, and manual test steps.
