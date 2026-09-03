# DEPLOYMENT_MATRIX

Source: `301992878aceeea8ea71985bb37b4770f93e3dd7`

| Component | Local | Remote | Deploy? | Confidence | Reason | Risk |
|---|---|---|---|---|---|---|
| Mini Program | `miniprogram/` @ freeze SHA | 开发/体验/正式 versions not fully inspectable via CLI | **YES** (upload 体验版 only) | MEDIUM | Waiting UX + client contracts on freeze; AppID/env match | Low if trial only; do not 正式发布 yet |
| CloudBase api | `miniprogram/cloudfunctions/api` | Deployed; Nodejs16.13; mod 2026-08-20 01:28:51; hash differs heavily; **no** `privacyMask.js` | **YES** | **HIGH** | Partner privacy / backoffice projection / coordination operator view missing remotely | High until deployed; privacy leak if skipped |
| CloudBase agent-graph | `.../agent-graph` (src; no local dist) | Deployed Nodejs20.19; mod 2026-08-19; 5/10 TS files differ | **YES** | **HIGH** | Local HY3/waiting/coordination sources differ; must **build dist** before upload | Medium; broken graph if deploy without build |
| CloudBase login | `.../login` | Deployed Nodejs16.13; mod 2026-08-19 | **NO** | HIGH | Functional identity vs remote (CRLF/whitespace only) | Low |
| CloudBase match-worker | `.../match-worker` | Deployed Nodejs20.19; timer `0 0 16 ? * TUE,THU *` (= Asia/Shanghai Wed/Fri 00:00) | **NO** | HIGH | Code/config functionally same; **do not recreate timer** | High if timer redeployed incorrectly |
| CloudBase report-worker | `.../report-worker` | Deployed; timer every minute in local config; remote active | **NO** | HIGH | Functional identity (CRLF); keep operational | Medium if removed |
| Express server | `server/src` | Docs: 腾讯云轻量 + 宝塔/PM2; **remote SHA not inspectable** | **YES** / UNKNOWN_REMOTE_STATE | MEDIUM | Freeze RBAC + response projection live in Express; needed if `/admin`/`/partner` served by Express | Medium if cloud-only backoffice only |
| Admin Web | `server/public/admin` | Served by Express `/admin`; also CLOUD_ONLY via `*.tcloudbaseapp.com` | **YES** (ATOMIC_WITH_SERVER when Express) | MEDIUM | Same freeze as Express; dual-mode UI | Low–Medium |
| Partner Web | `server/public/partner` | Served by Express `/partner` | **YES** (ATOMIC_WITH_SERVER when Express) | MEDIUM | Partner privacy UI depends on API + Express | Low–Medium |
| MySQL migration | `database/init.sql` + `patch-*.sql` | Production MySQL not reachable from audit host | **UNKNOWN** | LOW | Required only for Express/MySQL path | High if wrong migration applied |
| CloudBase DB/indexes | `api/lib/collections.js` map | NoSQL collection list not available via `tcb db nosql list` | **UNKNOWN** | LOW | Collections assumed already used by remote api | Medium if missing collection |

## Classification notes

- `login` / `report-worker`: **ACTIVE_NO_CHANGE** (deployed & used/active; no meaningful local delta). Not in `cloudbaserc.json` — do **not** add solely because folders exist.
- `match-worker`: **ACTIVE_NO_CHANGE**; schedule already product-correct.
- Topology: **C** — Express (Web+API legacy/local/ops) **and** CloudBase HTTP `/api` coexist.
