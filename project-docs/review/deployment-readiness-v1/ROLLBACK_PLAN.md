# ROLLBACK_PLAN

Do **not** execute rollback now. Plan only.

## CloudBase `api`

- Before deploy: `tcb fn code download api <outside-repo-backup>` (already sampled 2026-08-20 remote)
- Rollback: redeploy previous downloaded zip/folder via `tcb fn code update api` / WeChat IDE upload of previous artifact
- Keep HTTP routes `/api` and `/wxpay/notify` unchanged

## CloudBase `agent-graph`

- Backup current remote (includes `dist/`) before overwrite
- Rollback: re-upload previous `dist` bundle
- Verify invoke after rollback (read-only ping if available under future approval)

## `login` / `match-worker` / `report-worker`

- No code deploy recommended this round
- If accidentally changed: restore from outside-repo download snapshot
- **match-worker**: never “fix” timer by deleting/recreating without verifying cron `0 0 16 ? * TUE,THU *`

## Express + Admin/Partner

- Rollback Git tag/commit on server (`3019928` parent or previous known good)
- `npm install` + PM2 restart
- Confirm `/admin` and `/partner` static paths

## MySQL

- Take backup **before** any future migration
- Prefer backward-compatible patches
- No DROP/TRUNCATE in rollback of data; restore from backup only

## Mini Program

- 正式版 untouched until release
- 体验版 can be replaced by previous experience build
- Users on older 正式版 remain until WeChat release switch
