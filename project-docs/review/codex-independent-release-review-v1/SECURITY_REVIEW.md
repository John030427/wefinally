# SECURITY_REVIEW

- Partner list/detail allowlist projections resisted future-field, nested-canary, OpenID, raw AI, profile snapshot, and A/B metadata attacks.
- Express partner review authorization now follows current application assignment. Actual route test: former promoter 403; newly assigned partner 200 with minimized DTO.
- Express admin RBAC now fails closed for missing and unknown role claims.
- Lower-role response DTO fuzz found no OpenID/unionid/future-field leakage.
- No secrets were printed or added.

P0 found: 2. P0 unresolved: 0.
