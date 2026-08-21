# SECURITY_AUDIT

## Fixed this round

1. Partner application list full-document leak → allowlist projection
2. Partner ab_test_fixture exposure → removed from partner path
3. finance/auditor Express 403 vs UI mismatch → precise allowlists
4. AI ops fake normal on query failure → unknown
5. Partner private AI / OpenID / full phone regressions kept blocked
6. Partner cross-scope still denied

## Residual / environment

- Live MySQL customer-service workbench: **BLOCKED_ENVIRONMENT** (ECONNREFUSED 3306) when local DB unavailable
- Does not mark overall security suite as PASS when only live DB checks fail; report `PASS_WITH_ENV_BLOCKER`

## Negative tests (unit)

AUDITOR_MEMBER_REVIEW_ALLOWED / AUDITOR_WITHDRAW_DENIED / AUDITOR_AGENT_CONVERSATION_DENIED  
FINANCE_WITHDRAW_ALLOWED / FINANCE_MEMBER_REVIEW_DENIED / FINANCE_AGENT_CONVERSATION_DENIED  
CUSTOMER_SERVICE_OPENID_DENIED / SUPER_ADMIN_EXPECTED_ACCESS  
Partner SECRET_* attack on full JSON response
