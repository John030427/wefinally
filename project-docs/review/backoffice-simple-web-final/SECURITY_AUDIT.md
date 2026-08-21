# SECURITY_AUDIT

## Fixed this round (response data)

1. CS order/handoff/workbench/match OpenID payload leak → service DTOs + SELECT projection
2. Finance order OpenID via spread admin formatter → `formatOrderForFinance`
3. Finance withdraw full phone → masked
4. Auditor user detail match_settings + raw privacy logs → minimized
5. `CUSTOMER_SERVICE_OPENID_DENIED` now requires real DTO JSON attack tests

## Layers

- ROUTE_AUTHORIZATION: PASS
- RESPONSE_DATA_AUTHORIZATION: PASS

## Residual

LIVE_MYSQL = BLOCKED_ENVIRONMENT when local 3306 unavailable → overall `PASS_WITH_ENV_BLOCKER`
