# TEST_RESULTS

## Layered

| Layer | Result |
|---|---|
| STATIC_AND_UNIT / security DTO | PASS (`backoffice-simple-web-final`) |
| AI waiting UX | PASS |
| Mini Program syntax | PASS |
| release-guard | PASS |
| member | PASS |
| safety | PASS |
| agent-core | PASS (after local `api` npm install for deps) |
| match-staging-v18 | PASS |
| e2e:wefinally | PASS 14/14 |
| LIVE_MYSQL | **BLOCKED_ENVIRONMENT** (ECONNREFUSED / port 3306 closed) |

## Overall

**PASS_WITH_ENV_BLOCKER**

## Not run (by design)

- Model tournaments / public eval suites
- Live production smoke writes
- Payment transactions
- CloudBase deploy/invoke that mutates business data
