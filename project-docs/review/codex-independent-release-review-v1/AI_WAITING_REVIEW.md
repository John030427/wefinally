# AI_WAITING_REVIEW

Confirmed race: two `onSend()` calls could both pass `sending === false`, await the same network probe, then start separate turns. `_activeRequestId` suppressed the older completion while leaving its bubble generating.

Fix: `_turnStarting` is claimed synchronously before network probing for both send and retry, and released in `finally`.

Validation:

- Actual captured Mini Program Page handler: 2,000 rapid double-click races
- Completion-gate malformed inputs: 2,000 cases
- Existing waiting UX suite: PASS
- Mini Program syntax: PASS
- E2E 14/14: PASS
