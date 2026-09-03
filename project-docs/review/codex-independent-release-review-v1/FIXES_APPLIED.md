# FIXES_APPLIED

- Fail closed when an Express admin token lacks an explicit admin role.
- Add a current-assignment partner scope policy and use it in the actual Express audit route.
- Allow the newly assigned partner, not the former promoter, to access the reassigned application.
- Add synchronous AI turn reservation before network checks for send/retry.
- Make Cloud member review atomic with the existing transaction adapter and stable audit `from_status`.
- Honor an injected clock in `isVipActive`.
- Add `codex-release-adversarial.js` with actual handler races and 18,000 seeded fuzz cases.
