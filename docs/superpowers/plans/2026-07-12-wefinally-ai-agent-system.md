# WeFinally AI Customer Service and Agent System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three isolated WeFinally assistants backed by controlled tools, reviewed knowledge, privacy-safe context, and a deterministic first-date coordination workflow.

**Architecture:** Keep the existing mini-program request facade and CloudBase document database. Add a provider-neutral Agent Core under the existing `api` cloud function; business state is changed only through whitelisted tools. Date coordination is a deterministic workflow that remains usable when the LLM is unavailable.

**Tech Stack:** Native WeChat mini program, Node.js CommonJS, `wx-server-sdk`, CloudBase document database, MiniMax/DeepSeek-compatible HTTPS APIs, repository selfcheck scripts.

## Global Constraints

- Do not expose provider keys, OpenID, internal IDs, contact details, exact addresses, other-user raw answers, or model reasoning.
- Do not add LangChain, LangGraph, Dify, Redis, queues, vector databases, or a standalone server in v1.
- Platform state must come from tools; the model cannot directly read or mutate arbitrary collections.
- Both users must confirm the same proposal id and coordination version before a date becomes arranged.
- New production behavior follows red-green-refactor and must have deterministic selfcheck coverage.

---

### Task 1: Agent Core, safety, provider interface, and persistence contracts

**Files:** Create focused modules under `miniprogram/cloudfunctions/api/agent/`; modify `lib/collections.js`; add `server/selfcheck/agent-core.js` and an npm selfcheck script.

**Produces:** `AGENT_TYPES`, risk classifier, output sanitizer, context builder, knowledge retriever, provider-neutral `generateDecision(input)`, and session/run/tool audit repositories.

- [ ] Write tests for agent-type isolation, injection refusal, high-risk classification, output redaction, context limits, reviewed-knowledge filtering, and provider fallback.
- [ ] Run the tests and verify failures are caused by missing Agent Core modules.
- [ ] Implement the minimum modules and collection mappings to pass.
- [ ] Run the focused and existing CloudBase checks; commit `feat(agent): add secure agent core`.

### Task 2: Platform service and love advisor APIs

**Files:** Replace the fixed cloud chat handler with an Agent service adapter; extend `handlers/route.js` and `utils/constants.js`; add `server/selfcheck/agent-chat.js`.

**Produces:** session creation/history/message endpoints, live status tools, human-ticket creation, approved knowledge answers, daily love-advisor quotas, and legacy `/api/chat/*` compatibility.

- [ ] Write failing tests for member/VIP/match status tool use, no-guess fallback, separate histories, quota enforcement, manual takeover, and knowledge-miss behavior.
- [ ] Implement whitelisted tools and API handlers with dependency injection.
- [ ] Verify no response contains raw tool rows or another user's fields; run all focused checks.
- [ ] Commit `feat(agent): add platform service and love advisor`.

### Task 3: Deterministic date coordination workflow and API

**Files:** Create date workflow/policy/handler modules; extend collection and route maps; add `server/selfcheck/date-coordination-policy.js` and `date-coordination-cloud.js`.

**Produces:** coordination invitation, participant DTO, validated application, overlap computation, proposals, versioned confirmations, replanning, expiry, and manual handoff.

- [ ] Write failing policy tests for eligibility, 48/72/24-hour deadlines, application validation, no-overlap dimensions, stale proposal rejection, idempotency, and same-proposal confirmation.
- [ ] Implement pure state/overlap modules, then persistence handlers and privacy-safe DTOs.
- [ ] Add route tests proving forged coordination ids and cross-user reads fail.
- [ ] Run focused plus CloudBase/member/report/payment checks; commit `feat(date): add private coordination workflow`.

### Task 4: Three mini-program entries and date experience

**Files:** Add love-advisor and date-coordination pages; adapt chat for typed sessions; update home/profile/match-detail entries, app routes, API constants, and page styles.

**Produces:** distinct platform-service and love-advisor experiences, invitation/status flow, warm multi-step first-date application, proposal confirmation, and manual handoff UI.

- [ ] Write structural UI selfchecks for routes, entry boundaries, field limits, loading/error/expired states, and privacy copy.
- [ ] Implement stable page state models and request flows; reuse existing pink/white visual language without changing unrelated pages.
- [ ] Verify text does not expose the partner's raw answers and the form omits vehicle/address fields.
- [ ] Run UI lifecycle checks and commit `feat(miniprogram): add love advisor and date coordination`.

### Task 5: Cloud backoffice queues, retention, and end-to-end verification

**Files:** Extend the CloudBase backoffice handler and admin page for knowledge review, human tickets, and coordination queues; add retention policy/tests and deployment documentation.

**Produces:** role-scoped service workbench, knowledge draft/review/publish lifecycle, human reply/resume/close flow, configurable retention, and deployment checklist.

- [ ] Write failing tests for customer-service permissions, knowledge publication, manual takeover, redacted queue DTOs, and retention cleanup.
- [ ] Implement backoffice routes and minimal admin UI panels against CloudBase, not MySQL.
- [ ] Run all selfchecks, `git diff --check`, secret scans, and inspect the complete diff against the approved design.
- [ ] Commit `feat(backoffice): add agent service operations` and document cloud collections/configuration without deploying.

