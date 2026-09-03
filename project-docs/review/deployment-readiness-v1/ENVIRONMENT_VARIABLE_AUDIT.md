# ENVIRONMENT_VARIABLE_AUDIT

Values are **never** printed. Status is presence/requirement only.

## Express (`server/.env.example` names)

| Name | Required for freeze features | Status on audit host |
|---|---|---|
| JWT_SECRET | YES (Express auth) | UNKNOWN (local `.env` not audited into docs) |
| CORS_ORIGIN | YES | UNKNOWN |
| DB_* | YES if Express/MySQL path | UNKNOWN / local MySQL blocked |
| WX_APPID / WX_SECRET | YES for Express wx flows | UNKNOWN |
| WXPAY_* | YES if Express payment path | UNKNOWN |
| LLM_* / AGENT_LLM_ENABLED | optional | UNKNOWN |
| ADMIN_USER / ADMIN_PASS | bootstrap only | NOT_REQUIRED after admins exist |

Additional freeze-related names used in code (may be Cloud or Express):

| Name | Notes |
|---|---|
| BACKOFFICE_TOKEN_SECRET | Cloud/Express backoffice JWT |
| PARTNER_REFERRAL_SECRET | Partner attribution signing |
| PARTNER_PHONE_LOOKUP_SECRET | Partner phone lookup (optional fallback) |
| MATCH_WORKER_SECRET | match-worker + report-worker → api |
| LANGGRAPH_ACTOR_SECRET | agent-graph actor auth |
| AI_EXPECTED_PROVIDER / AI_EXPECTED_MODEL | Admin AI ops “配置目标” labels |

## CloudBase api remote

Many of the above **names** appear configured on remote `api` (from `tcb fn detail` metadata scan). Exact completeness:

**CONFIGURED** (names present for payment/AI/worker secrets)  
**UNKNOWN** for any missing optional names without side-by-side allowlist diff of names only.

## Payment isolation

Remote names include `PAYMENT_STAGE`, `PAYMENT_TEST_AMOUNT_FEN`, `WXPAY_ENABLED`, merchant key material **names**.

No payment call made in this audit.

## Rule

Future deploy docs must continue to log **names + CONFIGURED/MISSING only**, never secret values or certificates.
