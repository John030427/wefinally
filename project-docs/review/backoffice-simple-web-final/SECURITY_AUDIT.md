# Security Audit

## Findings fixed in this task
1. Partner list/detail over-exposure of openid/full phone → minimized
2. Cloud partner application detail full user dump → sanitized for partner role
3. Partner login returned full phone → masked
4. Cross-partner application access → denied (existing + retained)

## Existing controls retained
- Partner JWT + active status gate
- Admin role allowlists (Express + Cloud)
- Support-code identity for CS views

## Residual / PARTIAL
- Express auditor/finance UI vs API alignment improved in ROLE_PAGES but some Express routes remain super_admin-centric
- Deep service workbench private/shared labeling not fully redesigned
- Live MySQL CS workbench selfcheck needs local DB (ECONNREFUSED in this environment)

## Negative expectations covered by selfcheck
- Partner payload must not include openid / full phone
- Partner scope strings present
- Lower admin OpenID UI gated
