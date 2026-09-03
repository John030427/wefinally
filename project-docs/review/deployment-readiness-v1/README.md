# Deployment Readiness Audit v1

## Status

**AUDIT_DONE** — read-only. **deploy performed: NO**. **wechat upload: NO**.

- Audit branch: `release/deployment-readiness-v1`
- Source freeze: `feature/backoffice-simple-web-final` @ `301992878aceeea8ea71985bb37b4770f93e3dd7`
- CloudBase env (only one found): `cloud1-d4gy8l52g08bba326`
- Mini Program AppID: `wx91c6559ea4490a29` (matches `project.config.json`)

## Readiness

**READY_WITH_MANUAL_CHECK**

Code/security selfchecks PASS. Remaining: local MySQL live tests blocked; Express production commit not remotely inspectable; CloudBase NoSQL collection/index list not available via current CLI without dump; post-deploy human smoke / two-WeChat A/B still required.

## Hard stop

`DEPLOY_APPROVED` in this specification is **not** authorization.

Deployment requires a **new** human message:

```text
DEPLOY_APPROVED <audit_remote_head>
```

## Key verdict

| Component | Deploy? |
|---|---|
| Mini Program (体验版) | YES |
| CloudBase `api` | YES |
| CloudBase `agent-graph` | YES (build `dist` first) |
| CloudBase `login` | NO (ACTIVE_NO_CHANGE) |
| CloudBase `match-worker` | NO (ACTIVE_NO_CHANGE; Wed/Fri timer already correct) |
| CloudBase `report-worker` | NO (ACTIVE_NO_CHANGE) |
| Express + Admin/Partner | YES if Express hosts live backoffice; remote Express SHA UNKNOWN |
| MySQL migrations | UNKNOWN (no production MySQL read) |
| CloudBase DB/indexes | UNKNOWN (NoSQL list not available read-only without dump) |

## Docs in this bundle

See sibling files in this directory.
