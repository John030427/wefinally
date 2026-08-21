# Business Regression Checklist

Preserved in shared chat (contract selfcheck):

- [x] patch preview render (completed only)
- [x] primary resolution selection
- [x] confirm / cancel patch (`patchSubmitting`)
- [x] stale / invitation expired / already responded handling
- [x] human service handoff buttons
- [x] support code bar
- [x] history load → completed status
- [x] coordinator read-only input disable
- [x] no openid/phone in chat.js

Not weakened:

- Model never writes DB from WXML
- Proposal still requires deterministic backend validation
- Separate A/B confirmation semantics unchanged
- No streaming / no half patch UI
