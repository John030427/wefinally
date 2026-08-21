# FUNCTION_DIFF_MATRIX

Remote copies downloaded (outside repo) to:

`D:/wefinal/.tmp/deployment-readiness-v1-remote-code`

| Function | State | Evidence | Confidence | Deploy? |
|---|---|---|---|---|
| api | LOCAL_DIFFERS_REMOTE | 55 files hash-diff; remote missing `lib/privacyMask.js`, `lib/coordinationOperatorView.js`; remote `handlers/backoffice.js` lacks `projectPartnerApplicationItem` | HIGH | **YES** |
| agent-graph | LOCAL_DIFFERS_REMOTE | TS src: 5 same / 5 differ (`dateCoordination.ts`, `model.ts`, `cloudFunction.ts`, …). Local has **no** `dist/`; remote has built `dist/`. | HIGH | **YES** (build first) |
| match-worker | LOCAL_DIFFERS_REMOTE (whitespace) | `index.js`/`config.json` cron identical functionally; SHA differs due to CRLF | HIGH | **NO** |
| login | LOCAL_DIFFERS_REMOTE (whitespace) | Same openid return logic; CRLF/package whitespace | HIGH | **NO** |
| report-worker | LOCAL_DIFFERS_REMOTE (whitespace) | Same `processWorkerTasks` call payload; config.json IDENTICAL | HIGH | **NO** |

## api special notes

Freeze branch privacy/RBAC work depends on Cloud `api` for Mini Program + Cloud-only Admin (`CLOUD_ONLY` → `https://cloud1-….service.tcloudbase.com/api`).

Skipping `api` deploy leaves production Partner application list leak and missing operator_view contracts.

## agent-graph special notes

Entry `index.js` loads `./dist/src/cloudFunction.js`.

Future deploy must:

1. `npm install` + build dist in `agent-graph`
2. upload built artifact
3. keep runtime Nodejs20.19 / timeout aligned

Do not change prompt/model architecture in audit.

## login / report-worker status labels

| Function | Label |
|---|---|
| login | ACTIVE_NO_CHANGE |
| report-worker | ACTIVE_NO_CHANGE |
| match-worker | ACTIVE_NO_CHANGE |

Never add them to `cloudbaserc.json` merely because directories exist.
