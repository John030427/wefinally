# BLOCKERS

## Deployment-critical

| Item | Severity | Notes |
|---|---|---|
| None blocking code freeze deploy of Cloud `api`/`agent-graph` + Mini Program 体验版 | — | Evidence sufficient for those YES rows |

## Manual / environment (keep READY_WITH_MANUAL_CHECK)

| Item | Impact |
|---|---|
| LIVE_MYSQL BLOCKED_ENVIRONMENT | Cannot rerun Express live CS workbench DB tests |
| Express production SHA UNKNOWN | Confirm PM2/server commit before calling Express deploy complete |
| CloudBase NoSQL collection/index inventory UNKNOWN | Verify critical collections before assuming schema ready |
| agent-graph local `dist/` absent | Must build before upload |
| Human two-WeChat A/B not executed in this audit | Remains post-deploy gate |
| Single CloudBase env only | No separate staging env; use 体验版 as staging-like |

## Non-blockers misread as blockers

| Item | Clarification |
|---|---|
| login/report-worker not in cloudbaserc | Expected; ACTIVE_NO_CHANGE |
| match-worker hash differs | CRLF only; timer already correct |
| api remote Nodejs16 vs local Nodejs20 config | Controlled future runtime alignment; not a stop on “code must ship” |
