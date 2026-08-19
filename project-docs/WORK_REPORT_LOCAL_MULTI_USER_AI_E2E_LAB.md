# WeFinally Local Multi-User AI E2E Lab — Work Report

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Baseline HEAD | `8ee267b1df41c5e3520205333b89e8ecce641f6c` |
| Plan | `project-docs/plans/WEFINALLY_LOCAL_MULTI_USER_AI_E2E_PLAN.md` |
| Architecture | LEVEL 1 — in-memory DB + real CloudBase business handlers via DI |

## 2. Delivered Lab Structure

```
server/e2e/wefinally/
  index.js              CLI entry (reset | seed | run | list)
  runner.js             Scenario orchestration + artifacts
  harness/
    memoryDb.js         Isolated in-memory collections
    serviceFactory.js   Wires real api handlers
    context.js          OPENID + CONTROLLED_USER_ID test contexts
    aiProvider.js       fixture (default) vs live hy3 smoke
    profileService.js   Profile + AI profile helpers
    matchService.js     Formal matching pipeline wrapper
  personas/             Catalog A–S + factory seeding
  scenarios/            14 end-to-end scenarios
  assertions/           PROFILE / MATCH / DATE / PRIVACY checks
  reporter/             Console summary + artifacts/e2e/latest.{json,md}
  reset/guard.js        Refuses unsafe run IDs / production cleanup
```

## 3. npm Commands

| Command | Purpose |
|---|---|
| `npm --prefix server run e2e:wefinally` | Run all 14 scenarios (fixture AI) |
| `npm --prefix server run e2e:wefinally:live` | Same + opt-in hy3 live smoke |
| `npm --prefix server run e2e:wefinally:scenario -- --scenario=<id>` | Single scenario |
| `npm --prefix server run e2e:wefinally:reset` | Reset guard check |
| `npm --prefix server run e2e:wefinally:seed` | Seed persona catalog into fresh memory DB |
| `npm --prefix server run selfcheck:e2e-release-guard` | Block test-only tokens in client paths |

Environment:

- `E2E_AI_MODE=fixture` (default) — deterministic mocks
- `E2E_LIVE_SMOKE=true` — set by `:live` script; only affects live-ai-smoke scenario
- `E2E_RUN_ID=e2e_<label>_<timestamp>` — optional isolation tag

## 4. Scenario Matrix (14/14 PASS)

| Scenario | Personas | Validates |
|---|---|---|
| match-success | A, B | Bilateral PASS + report path |
| age-hard-fail | C, D | AGE_HARD_GATE |
| one-sided | E, F | One-sided penalty |
| ai-profile | A | AI Match Profile schema + USER_DECLARED correction |
| profile-evolution | S | Profile edit → stale → recompile v1→v3 |
| date-coordinate | G, H | Patch preview, no direct DB write |
| direct-accept | I, J | ARRANGED |
| decline | K, L | INVITATION_DECLINED |
| no-response | M, N | EXPIRED |
| primary-resolution | O, P | 福田/罗湖 disambiguation |
| privacy | Q, R | No cross-party private leak in graph payload |
| langgraph-resume | G, H | Multi-turn thread resume |
| experience-feedback | I | Post-date feedback persisted |
| live-ai-smoke | — | hy3 via CloudBase (blocked without creds) |

Artifacts: `artifacts/e2e/latest.json` and `latest.md`

## 5. Product Fixes (Phase 4)

1. **Profile entry** — `profile` page adds always-visible「个人资料」menu + user-card「编辑 ›」→ `register?edit=1`
2. **Register edit** — title「个人资料」; pre-fills `income_range`; PUT sends `income_range`
3. **AI invalidation** — `user.updateProfile` marks `ai_match_profile_stale` when `shouldInvalidateAiMatchProfile` fires
4. **Fingerprint keys** — extended `MEANINGFUL_SOURCE_KEYS` with `height_range`, `income_range`, `house_car`, `appearance_description`

## 6. Regression Fixes

| Issue | Fix |
|---|---|
| `agent-chat.js` coordination 51 session blocked | Allow initiator session in `collecting_initiator` inside `agent.createSession` while UI policy keeps `canOpenCoordinatorChat=false` |
| `ai-report-cloud-task.js` stale assertions | Updated to match `maxTokens` + current timeout clamp |
| Live smoke crash without creds | Credential preflight in `live-ai-smoke.js` (TcbError bypasses try/catch on Node 24) |
| Release guard false positive | Allowlist `controlledDateScenarioService.js` |

## 7. Verification (2026-08-20)

```
npm --prefix server run selfcheck:agent          PASS
npm --prefix server run selfcheck:safety         PASS
npm --prefix server run selfcheck:ai-report      PASS
npm --prefix server run selfcheck:cloudpay       PASS
npm --prefix server run selfcheck:member         PASS
npm --prefix server run selfcheck:cloud-match    PASS
npm --prefix server run selfcheck:synthetic-coordination  PASS
npm --prefix server run selfcheck:e2e-release-guard       PASS
npm --prefix server run e2e:wefinally            14/14 PASS
npm --prefix server run e2e:wefinally:live       14/14 PASS (live smoke BLOCKED without creds)
```

## 8. Level 3 — Manual WeChat A/B Script

Use two real WeChat test accounts (internal QA tagged). Do **not** use production users.

### Preconditions

- Deploy `api` + `agent-graph` to staging CloudBase env
- Upload mini-program to **体验版** with QA flags enabled for internal testers
- Account A: `internal_qa` identity; Account B: synthetic fixture owner or second QA device

### Script A — Match → Report → Invite

1. A completes profile via「我的 → 个人资料」; change income; confirm save toast
2. A opens「择偶配置」→ generate AI Match Profile; note version
3. Trigger QA match run (match-list QA panel or formal cycle) until A sees B on match-detail
4. Open match report; confirm AI disclosure label present
5. Tap「申请约会」→ fill initiator application → send invitation
6. On B device: accept invitation → submit conflicting preferences
7. A opens「和 AI 约会协调员沟通」→ send area patch NL → confirm preview
8. Complete proposal + double confirm → status `arranged`

### Script B — Decline + Privacy

1. Repeat match through invite on a fresh pair (K/L personas in staging fixtures)
2. B declines → A sees「对方暂未接受」inbox; no coordinator CTA
3. During coordination on another pair, verify B's transport/other_requirements never appear in A's chat or graph debug (admin-only)

### Script C — Profile evolution

1. Edit profile field covered by `MEANINGFUL_SOURCE_KEYS` (e.g. `house_car`)
2. Return to match-setting → confirm stale badge / regen path
3. Re-run AI profile compile → version increments

### Stop / Escalate

- Any cross-user private field leak → **stop**, file security incident
- LangGraph unavailable → note `provider=langgraph fallback` in chat; compare with `e2e:wefinally` fixture baseline
- Live hy3 failures → run `server/selfcheck/cloudbase-ai-live-smoke.js` with `tcb` CLI + worker secret

## 9. Out of Scope (by design)

- No production OPENID impersonation endpoints
- No WeChat upload / production deploy from this lab
- No destructive production DB reset
- Level 2 real LangGraph CloudBase invoke: use existing `controlled-date-langgraph-e2e.js` + `WEFINALLY_LIVE_GRAPH_SMOKE=pass`

## 10. Cursor Skill

See `.cursor/skills/wefinally-e2e/SKILL.md` for the agent run/fix/rerun loop.
