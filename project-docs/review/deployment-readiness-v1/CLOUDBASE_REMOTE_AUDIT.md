# CLOUDBASE_REMOTE_AUDIT

## Environment

| Field | Value |
|---|---|
| Env ID | `cloud1-d4gy8l52g08bba326` |
| Region tip | CLI default `ap-shanghai` |
| Env count found | **1** (no separate staging env discovered) |
| Package | 个人版 (from `tcb env list`) |
| Status | Normal |
| Static/hosting domain | `cloud1-d4gy8l52g08bba326-1451453378.tcloudbaseapp.com` |

## HTTP access (read-only)

| Path | Resource | Type |
|---|---|---|
| `/api` | `api` | Cloud function |
| `/wxpay/notify` | `api` | Cloud function |

## Functions present remotely

| Name | Runtime | Modification time | Status |
|---|---|---|---|
| api | Nodejs16.13 | 2026-08-20 01:28:51 | Deployment completed |
| agent-graph | Nodejs20.19 | 2026-08-19 20:56:45 | Deployment completed |
| match-worker | Nodejs20.19 | 2026-08-20 00:11:57 | Deployment completed |
| login | Nodejs16.13 | 2026-08-19 13:15:20 | Deployment completed |
| report-worker | Nodejs16.13 | 2026-08-19 13:15:18 | Deployment completed |
| wxpayFunctions | Nodejs16.13 | 2026-08-19 13:15:20 | (platform/payment template; out of freeze scope) |
| lowcode-automation* | Nodejs16.13 | 2026-08-19 13:15:20 | (platform; not product freeze) |

## Local cloudbaserc.json declares

Only: `api`, `agent-graph`, `match-worker`.

Does **not** declare `login` / `report-worker` — those are deployed/managed separately historically.

## match-worker timer

Local `cloudbaserc.json` + `match-worker/config.json`:

`0 0 16 ? * TUE,THU *` → UTC Tue/Thu 16:00 = **Asia/Shanghai Wed/Fri 00:00**.

Remote downloaded config shows the **same** cron string.

**Do not recreate/alter this trigger** during a future deploy unless explicitly authorized.

## Env var NAMES observed on api (values redacted / not logged)

Presence of names including (non-exhaustive):

`BACKOFFICE_TOKEN_SECRET`, `BACKOFFICE_CORS_ORIGIN`, `PARTNER_REFERRAL_SECRET`, `MATCH_WORKER_SECRET`, `LANGGRAPH_ACTOR_SECRET`, `PAYMENT_STAGE`, `WXPAY_*`, `MINIMAX_*`, `DEEPSEEK_*`, `AGENT_LLM_ENABLED`, `MINIPROGRAM_ENV_VERSION`

Classification of values: **CONFIGURED** remotely for many payment/AI keys (names visible); exact completeness vs local `.env.example` = **UNKNOWN** without secret comparison.

## CLI used

CloudBase CLI **3.7.3** (`tcb` / `cloudbase`).

Read-only ops used: `fn list`, `fn detail`, `fn code download` (to outside-repo path), `env list`, `service list`, `env domain list`, `list-function-versions`.

**Not used:** deploy, invoke writes, SQL execute, dump of user data.
