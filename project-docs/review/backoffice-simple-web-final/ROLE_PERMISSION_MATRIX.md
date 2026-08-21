# ROLE_PERMISSION_MATRIX

## Express Admin (`server/src/utils/adminRbac.js`)

| Role | Allowed | Denied |
|---|---|---|
| super_admin | 全部路由 | — |
| customer_service | dashboard, service/workbench, orders(R), chat, handoff, matches(R) | withdrawals, member review, OpenID, system |
| auditor | dashboard, member-applications GET/PUT review, users(R), partners(R) | withdrawals, chat/AI private, finance write |
| finance | dashboard, orders(R), withdrawals GET/PUT | member review, chat/AI, matches private, OpenID |

OpenID：仅 `super_admin`（`canSeeOpenId`）。

## Cloud Agent backoffice

| Capability | Roles |
|---|---|
| Agent conversations / tickets / reply | super_admin, customer_service |
| Knowledge publish/offline | super_admin, auditor（内容治理）|
| Date coordinations list | super_admin, customer_service |

## Frontend ROLE_PAGES

```
customer_service: dashboard, service, orders, chat, handoff, matches
auditor: dashboard, members, users, partners
finance: dashboard, orders, withdrawals
```

必须与 backend allowlist 一致；不得 UI 宣称可进、API 全 403。
