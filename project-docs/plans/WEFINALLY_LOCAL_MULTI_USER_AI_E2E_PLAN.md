# WeFinally Local Multi-User AI E2E Lab — Plan

> Saved from architecture audit, 2026-08-20. Do not treat as live progress tracker; see `WORK_REPORT_LOCAL_MULTI_USER_AI_E2E_LAB.md` for execution results.

## Git Baseline (start)

| Item | Value |
|------|-------|
| Branch | `feature/ai-profile-bilateral-coordination` |
| HEAD | `8ee267b1df41c5e3520205333b89e8ecce641f6c` |
| Remote | `origin/feature/ai-profile-bilateral-coordination` @ same |
| Dirty files | User-owned modifications (match.js, qaFixturePool, project.config, partner UI, etc.) — not reset |

## Goal

Local, repeatable, resettable multi-user E2E covering: profile → AI Match Profile → hard gate → bilateral → rerank → report → match → invitation → coordination → LangGraph → patch → confirm → ARRANGED → feedback.

## Architecture

See attached plan sections: CURRENT_E2E_ARCHITECTURE, Three-Level Testing, `server/e2e/wefinally/` layout, Persona Matrix, Scenario Matrix.

## Implementation Phases

0. Plan + baseline
1. Harness (`memoryDb`, `serviceFactory`, persona factory, CLI)
2. Match + AI profile scenarios
3. Date coordination scenarios
4. Profile edit product fixes
5. Regression (`selfcheck:agent` + baseline)
6. Live hy3 smoke (opt-in)
7. Docs + Cursor skill
8. Git commits (on request)

## Commands

```powershell
npm --prefix server run e2e:wefinally:reset
npm --prefix server run e2e:wefinally:seed
npm --prefix server run e2e:wefinally
npm --prefix server run e2e:wefinally:scenario -- match-success
npm --prefix server run e2e:wefinally:live
```

## Safety Rules

- No production impersonation endpoints
- Reset only `e2e_*` / `fixture_run_id` scoped rows
- `E2E_AI_MODE=fixture` default; live requires explicit opt-in
- No WeChat upload / production deploy from E2E skill
