# SERVER_DEPLOYMENT_TOPOLOGY

## Verdict

**Topology C — Both coexist**

1. **CloudBase HTTP function `api`** hosts Mini Program backend + payment notify + Cloud-only Admin/Partner API base.
2. **Express server** (`server/src/app.js`) hosts:
   - static Admin Web at `/admin` → `server/public/admin`
   - static Partner Web at `/partner` → `server/public/partner`
   - REST `/api/*` (auth, admin, partner, match, wxpay, …) against **MySQL**

Admin UI itself detects Cloud-only:

- hostname `*.tcloudbaseapp.com` or `cloudOnly=1` → calls CloudBase HTTP API
- otherwise → relative `/api` on Express

## Not independent static CDN (by default)

Admin/Partner are **ATOMIC_WITH_SERVER** when served by Express.

There is a CloudBase static domain enabled (`*.tcloudbaseapp.com`), so Cloud-hosted Admin is also possible — still depends on **Cloud `api`**, not a separate SPA build pipeline found in-repo.

## How Express is intended to be deployed (docs only)

`docs/deploy-tencent.md`:

- 腾讯云轻量应用服务器
- 宝塔 + MySQL 8 + Nginx
- PM2 running `server/src/app.js`
- No Dockerfile in freeze tree

## Remote Express SHA

**UNKNOWN_REMOTE_STATE** — audit host has no SSH/PM2 inventory of the production Node process commit.

## Matrix flags

| Flag | Value |
|---|---|
| EXPRESS_SERVER_DEPLOY | **YES** if production operators use Express `/admin`/`/partner`; else UNKNOWN |
| ADMIN_WEB_DEPLOY | **YES** (ATOMIC_WITH_SERVER) |
| PARTNER_WEB_DEPLOY | **YES** (ATOMIC_WITH_SERVER) |
| Web deployment mode | **ATOMIC_WITH_SERVER** (primary); Cloud-only Admin possible via CloudBase domain + api |
