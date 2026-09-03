# ROLE_PERMISSION_MATRIX

## Two layers

1. **ROUTE_AUTHORIZATION** — `server/src/utils/adminRbac.js`
2. **RESPONSE_DATA_AUTHORIZATION** — `server/src/utils/roleDataProjection.js`

Both must PASS. See `ROLE_DATA_PROJECTION_AUDIT.md`.

## Express Admin routes

| Role | Allowed routes | Denied |
|---|---|---|
| super_admin | 全部 | — |
| customer_service | dashboard, service/workbench, orders(R), chat, handoff, matches(R) | withdrawals, member review |
| auditor | dashboard, member-applications GET/PUT review, users(R), partners(R) | withdrawals, chat/AI private, finance write |
| finance | dashboard, orders(R), withdrawals GET/PUT | member review, chat/AI, matches |

## Response data (summary)

| Role | OpenID | Full phone | match_settings | raw privacy logs |
|---|---|---|---|---|
| super_admin | YES (explicit) | YES (explicit) | YES | YES |
| customer_service | NO | masked / none | NO on match detail | N/A |
| finance | NO | MASKED_ONLY | N/A | N/A |
| auditor | NO | MASKED_ONLY | NO | NO |

## Frontend ROLE_PAGES

```
customer_service: dashboard, service, orders, chat, handoff, matches
auditor: dashboard, members, users, partners
finance: dashboard, orders, withdrawals
```
