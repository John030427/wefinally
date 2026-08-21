# ROLE_DATA_PROJECTION_AUDIT

## Distinction

| Layer | Meaning | Status |
|---|---|---|
| ROUTE_AUTHORIZATION | 角色能否访问该 HTTP 路由 | PASS |
| RESPONSE_DATA_AUTHORIZATION | 返回 payload 是否最小化 / 无 OpenID 泄露 | PASS |

两者必须都 PASS。仅 `canSeeOpenId(role) === false` 不能宣称 Customer Service OpenID denied。

## Customer Service

| Endpoint | Projection | OpenID |
|---|---|---|
| GET /orders | `formatOrderForService` | NO |
| GET /handoff/tickets | `formatHandoffTicketForService` | NO |
| GET /service/workbench | chat/handoff/order service DTOs | NO |
| GET /matches | `formatMatchForService` | NO |
| GET /matches/:id | projected log + side without openid/settings | NO |
| GET /chat/sessions | `formatChatSessionForService` | NO |

Uses: `support_code` / `WF-U-xxxx` / internal `user_id`.

## Finance

| Endpoint | Projection | OpenID / phone |
|---|---|---|
| GET /orders | `formatOrderForFinance` | OpenID NO |
| GET/PUT /withdrawals | `formatWithdrawForFinance` | phone MASKED_ONLY |

## Auditor

| Endpoint | Projection | Denied |
|---|---|---|
| GET /users/:id | `formatUserDetailForAuditor` | openid, match_settings, privacy_auth_logs raw |
| GET /users | `formatUserForAdmin` without openid | openid |

Agreements: coarse `agreements_status` booleans only.

## Implementation

`server/src/utils/roleDataProjection.js`
