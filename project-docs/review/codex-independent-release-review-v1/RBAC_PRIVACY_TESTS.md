# RBAC_PRIVACY_TESTS

Deterministic seed: `0x57ef1a11`.

- RBAC/privacy DTO: 5,000 cases
- Partner unknown-field projection: 2,000 cases
- Partner IDOR/scope combinations: 2,000 cases
- Missing/unknown admin roles: direct negative checks
- Actual Express partner handler: reassignment deny/allow pair

All passed after fixes. Existing `backoffice-simple-web-final` also passed all route and response authorization checks.
