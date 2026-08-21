# TEST_RESULTS

## Layered outcome

| Layer | Result |
|---|---|
| STATIC_AND_UNIT | **PASS** |
| SECURITY_NEGATIVE | **PASS** |
| E2E (`npm run e2e:wefinally`) | **PASS** (14/14) |
| LIVE_MYSQL | **BLOCKED_ENVIRONMENT** |

## Overall

**tests: PASS_WITH_ENV_BLOCKER**

Do not summarize as vague PARTIAL.

## Key selfcheck

```
node server/selfcheck/backoffice-simple-web-final.js
```

Includes partner allowlist attack, RBAC negatives, AI ops unknown semantics, coordination operator view, admin/partner UI contracts.

## Regressions kept

- partner full phone visible = NO
- partner OpenID visible = NO
- partner private AI accessible = NO
- partner cross-scope = BLOCKED
- dangerous confirmation = PASS
- e2e:wefinally = PASS
