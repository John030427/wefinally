---
name: wefinally-e2e
description: Run, fix, and rerun the WeFinally local multi-user E2E lab (server/e2e/wefinally). Use when validating match, AI profile, date coordination, LangGraph, or profile-edit flows before release.
---

# WeFinally E2E Lab

## When to use

- Before merging match, coordination, AI profile, or profile-edit changes
- After fixing a scenario failure reported in `artifacts/e2e/latest.json`
- When asked to validate the full product chain locally without WeChat devices

## Hard blocks — do NOT proceed without explicit user authorization

- Deploy `api` or `agent-graph` cloud functions to production
- Upload mini-program to WeChat (体验版/正式版)
- Delete or bulk-modify production CloudBase collections
- Add `CONTROLLED_USER_ID` or `LOCAL_E2E` to mini-program client code (only allowed in `server/e2e` and `server/selfcheck`)

## Quick run

```powershell
cd D:\wefinal\.worktrees\wefinally-ai-agent
npm --prefix server run e2e:wefinally
```

Read results:

- Console summary (PASS/FAIL per scenario)
- `artifacts/e2e/latest.json`
- `artifacts/e2e/latest.md`

Single scenario:

```powershell
node server/e2e/wefinally/index.js run --scenario=date-coordinate
```

Opt-in live hy3 smoke (requires TCB/TencentCloud credentials in env):

```powershell
npm --prefix server run e2e:wefinally:live
```

## Baseline selfchecks (run after E2E fixes)

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
npm --prefix server run selfcheck:synthetic-coordination
npm --prefix server run selfcheck:e2e-release-guard
```

## Fix loop

1. **Identify** failing scenario from console or `latest.json`
2. **Reproduce** with `--scenario=<id>`
3. **Inspect** scenario file under `server/e2e/wefinally/scenarios/`
4. **Trace** into real handler via `harness/serviceFactory.js` (requires `../../../../miniprogram/cloudfunctions/api/...`)
5. **Fix** business logic or scenario assertion — prefer fixing product bugs over weakening assertions
6. **Re-run** full suite: `npm --prefix server run e2e:wefinally`
7. **Update** `project-docs/DEVELOPMENT_LOG.md` for non-trivial fixes

## Common pitfalls

| Symptom | Likely cause |
|---|---|
| `无权进入该约会协调会话` | Missing `applyCoordinationIdentity` — A must be `internal_qa`, B synthetic with owner link |
| Duplicate `respondInvitation` error | Synthetic auto-advance already moved status past `inviting_partner` |
| `require` path failure from harness | Use 4 levels up to repo root: `../../../../miniprogram/...` |
| Live smoke process crash | Missing CloudBase creds — preflight in `live-ai-smoke.js`; use fixture mode for CI |
| AI profile not stale after edit | Check `MEANINGFUL_SOURCE_KEYS` + `user.updateProfile` stale marking |

## Architecture reminder

- **LEVEL 1 lab**: in-memory DB, real handlers, fixture AI by default
- Test context: `createTestContext({ openid, userId })` sets `OPENID` + optional `CONTROLLED_USER_ID`
- Data isolation: openids like `e2e_<persona>_<runId>`, `fixture_run_id`, `is_test_fixture=1`
- Plan reference: `project-docs/plans/WEFINALLY_LOCAL_MULTI_USER_AI_E2E_PLAN.md`
- Work report: `project-docs/WORK_REPORT_LOCAL_MULTI_USER_AI_E2E_LAB.md`

## Persona quick reference

| Label | Role |
|---|---|
| A, B | High mutual match pair |
| C, D | Age hard gate |
| E, F | One-sided fit |
| G, H | Coordination + LangGraph resume |
| I, J | Direct accept / feedback |
| K, L | Decline |
| M, N | No response / expire |
| O, P | Primary area resolution |
| Q, R | Privacy |
| S | Profile evolution |
