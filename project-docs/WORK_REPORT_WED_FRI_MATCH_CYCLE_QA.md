# WeFinally Wed/Fri Match Cycle & QA

## 1 Baseline

| Item | Value |
|------|-------|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `3f030177b67c33b7ca68b4cc9f8637b524affb60` |
| Dirty files (user-owned, not committed) | `miniprogram/project.config.json`, `server/public/partner/index.html`, `server/selfcheck/cloudbase-partner-connection.js`, `server/selfcheck/customer-service-browser-fixture.js`, assorted untracked docs/specs |

## 2 Original Product Rule

- **Wednesday 00:00 Asia/Shanghai** — each valid member receives at most **1** match
- **Friday 00:00 Asia/Shanghai** — each valid member receives at most **1** more match
- **Max 2 matches per week**; no manual refresh for production users
- If no candidate passes hard/quality gates → **NO_MATCH** for that cycle (no forced pairing)

## 3 Old Bug

`match_claim` used permanent document IDs (`user_${userId}`, `pair_${pairKey}`) with no cycle scope.  
`formalMatching.js` and `match.js` `start()` treated **any historical `status=claimed`** as a permanent block → users matched once (e.g. 8/14) could never receive Friday or next-week matches.

## 4 Match Cycle Model

| Field | Semantics |
|-------|-----------|
| Production cycle ID | `2026-08-19-WED`, `2026-08-21-FRI` (backend-derived, Asia/Shanghai) |
| Batch key | `formal:${matchCycleId}` |
| Claim doc IDs | `user_${id}__${cycleSlug}`, `pair_${pairKey}__${cycleSlug}` |
| Historical pair | `pair_hist_${pairKey}` — permanent dedupe, does not block new cycles |
| QA cycle ID | `QA:${userId}:${timestamp}` — isolated from production |
| Eligibility | Block only **same production cycle** claims; ignore QA / legacy permanent user docs |

## 5 Legacy Compatibility

- Old claims **without** `match_cycle_id` remain in DB (not deleted)
- They **do not** block new Wed/Fri cycles
- Their `pair_key` still contributes to **historical partner dedupe** (no automatic rematch)

## 6 Scheduler — MATCH_SCHEDULER_AUDIT

| Check | Before deploy | After deploy |
|-------|---------------|--------------|
| Wednesday trigger (Shanghai 00:00) | **MISSING** — `match-worker` not deployed | **FOUND** — cron `0 0 16 ? * TUE,THU *` |
| Friday trigger (Shanghai 00:00) | **MISSING** | **FOUND** — same cron (Tue/Thu 16:00 UTC) |
| Timezone | CloudBase cron is **UTC**; Tue/Thu 16:00 UTC = Wed/Fri 00:00 **Asia/Shanghai** | Same |
| Target function | `match-worker` → `api` action `runFormalMatchBatch` | Deployed |
| Trigger name | `formal-match-utc-offset` | Enabled |
| `MATCH_WORKER_SECRET` on match-worker | N/A | Configured (copied from `api` env, not logged) |

**Next expected run:** Next Tuesday 16:00 UTC (= Wednesday 00:00 Shanghai), then Thursday 16:00 UTC (= Friday 00:00 Shanghai).

Dry-run cycle resolution (Wed 2026-08-19): `match_cycle_id=2026-08-19-WED`, `batch_key=formal:2026-08-19-WED`.

## 7 QA Simulation

- **Internal QA only** — `qa_test_run_enabled` on match-list page
- User selects fixture journey → **10s countdown** → `POST /api/match/test-runs` → poll → `execute`
- Calls same matching/rerank path as production; QA cycle IDs isolated
- **Not** a production cron — client countdown + internal endpoint only

## 8 Fixture Pool

| Fixture | Badge | `fixture_journey` | Notes |
|---------|-------|-------------------|-------|
| A | 测试 · 直接接受 | `accept_direct` | |
| B | 测试 · AI协调 | `coordinate` | Default QA scenario |
| C | 测试 · 暂不方便 | `decline` | |
| D | 测试 · 不回应 | `no_response` | |
| E | 测试 · 接受未填偏好 | `accept_no_prefs` | |
| F | 测试 · 手动推进 | `coordinate` + `fixture_mode=manual_step` | Manual B controls via existing advance-synthetic |

Pool seeded on first QA execute via `ensureQaFixturePool()`.

## 9 AI Coordination Smoke

- Production AI path unchanged: **CloudBase / hy3** (Phase 1 migration preserved)
- Coordinate fixture uses real `respondInvitation`, date coordination state machine, LangGraph via `agent-graph`
- **Manual WeChat verification required** for full NL patch + hy3 live smoke on device

## 10 Tests

| Suite | Result |
|-------|--------|
| `selfcheck:match-cycle` MATCH CYCLE 01–20 | **PASS** |
| `selfcheck:cloud-match` | **PASS** |
| `selfcheck:ai-profile-bilateral` | **PASS** |
| `selfcheck:synthetic-coordination` | **PASS** |
| `selfcheck:safety`, `member`, `ai-report` | **PASS** |
| `selfcheck:agent` | **PARTIAL** — `agent-chat.js` fails with pre-existing coordination-ended guard (unrelated to match cycle) |
| `selfcheck:cloudbase-ai-provider` (hy3) | **PASS** (in agent chain) |

## 11 CloudBase Deployment

| Item | Value |
|------|-------|
| Environment | `cloud1-d4gy8l52g08bba326` |
| Functions deployed | `api`, `match-worker` (new) |
| Triggers | `match-worker` timer enabled |
| agent-graph | **Not modified / not redeployed** |

## 12 Database

**Migration: NO**

- Additive fields only on new writes: `match_cycle_id`, `is_test`, `qa_cycle`, `matched_at` on claims/logs
- No destructive migration; legacy claims retained

## 13 Git

| Item | Value |
|------|-------|
| Start HEAD | `3f030177b67c33b7ca68b4cc9f8637b524affb60` |
| Commits | (see push output) |
| Push branch | `feature/ai-profile-bilateral-coordination` |

## 14 Manual WeChat Verification

Please verify on Internal QA account in WeChat DevTools:

- [ ] Match-list shows **测试下一轮匹配** (production account must NOT see it)
- [ ] Scenario **AI协调** → 10s countdown → match shows **测试 · AI协调**
- [ ] **直接接受** / **暂不方便** / **不回应** / **accept_no_prefs** scenarios
- [ ] **手动推进** — B stays in INVITING until advance controls used
- [ ] AI coordinator: real LangGraph + hy3 patch preview on coordinate flow
- [ ] Legacy 8/14 match does not block new QA or Friday production cycle
- [ ] Friday formal countdown (wait for next Fri 00:00 or dry-run in backoffice)
