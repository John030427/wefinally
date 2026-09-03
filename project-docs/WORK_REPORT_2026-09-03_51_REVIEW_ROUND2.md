# WeFinally 5.1 Review Round 2 Work Report

- Branch: `fix/date-counter-offer-negotiation`
- Release code commit: `1c223b27deaa701dd6589905646627f3847e252c`
- GitHub remote SHA: `1c223b27deaa701dd6589905646627f3847e252c` (`origin/fix/date-counter-offer-negotiation`)
- Baseline before Round 2: `52fd28b`
- CloudBase env: `cloud1-d4gy8l52g08bba326`
- Function: `api`
- Runtime: `Nodejs16.13`
- Deployment method: clean `git archive` staging of release SHA (no `node_modules`) + `tcb fn code update api -e cloud1-d4gy8l52g08bba326 --deployMode cos`
- Deployment start: `2026-09-03T16:04:42+08:00`
- Deployment modification time: `2026-09-03 16:04:46`
- Function status after deploy: `Deployment completed` / runtime `Nodejs16.13`
- Smoke: `{ action: 'ping' }` → `pong` / env `cloud1-d4gy8l52g08bba326`
- Env vars: not modified
- Mini Program upload: NOT PERFORMED
- Live graph smoke: `MANUAL_REQUIRED`

## Task commits

| Task | Commit | Message |
|------|--------|---------|
| 1 Bootstrap dedupe collections | `180c301` | fix(cloudbase): bootstrap coordination dedupe collections |
| 2 Atomic unread cursor | `6d92aa4` | fix(notification): update unread cursor atomically |
| 3 Event/message idempotency | `439c98d` | fix(date): make coordination events and messages idempotent |
| 4 Restore project.config formatting | `1c223b2` | chore: restore local project config formatting |
| 5 This report (docs only; after deploy) | _(this commit)_ | docs: record 5.1 round 2 deployment |

Release code for CloudBase is **`1c223b2`**. This documentation commit is intentionally later and must not be confused with the deployed release SHA.

## Tests

| Command | Result |
|---------|--------|
| `node server/selfcheck/date-coordination-review-followups.js` | PASS |
| `node server/selfcheck/coordination-notification-concurrency.js` | PASS |
| `node server/selfcheck/date-coordination-events.js` | PASS (incl. concurrency + delivery recovery) |
| `npm --prefix server run selfcheck:date-counter-offer` | PASS |
| `npm --prefix server run selfcheck:date-qa-reset` | PASS |
| `npm --prefix server run selfcheck:ai-report` | PASS |
| `npm --prefix server run selfcheck:agent` | PASS (`LIVE_GRAPH_SMOKE: MANUAL_REQUIRED`) |
| `npm --prefix server run selfcheck:release-guard` | PASS |
| `git diff --check` | PASS |
| `node --check` on `db.js` / `coordinationInbox.js` / `dateCoordinationEvents.js` | PASS |
| `git diff 7ef3d33 -- miniprogram/project.config.json` | empty |

## What changed (Round 2 only)

1. Mapped and bootstrap-whitelisted `coordination_notification_dedupe`, `date_coordination_event_dedupe`, `agent_message_dedupe`.
2. Notification create-once now updates `user_notification_cursor.unread_count` in the same transaction; Inbox no longer increments unread outside the txn.
3. Coordination events and participant projection messages use SHA-256 lock create-once; duplicate event publish still compensates missing messages.
4. Restored trailing newline on `miniprogram/project.config.json` only.

## Still need real-device verification

- End-to-end LangGraph live smoke (`LIVE_GRAPH_SMOKE: MANUAL_REQUIRED`)
- Dual-phone concurrent notification unread badge under weak network
- Dual-phone same coordination event retry after mid-delivery failure (message compensation)
- Counter-offer / arrival-position / AI report product paths already covered by selfcheck; spot-check on WeChat DevTools after separate miniprogram upload authorization
- Miniprogram experience-version upload remains a separate action and was not done in this release

## Codex follow-up review and deployment (2026-09-03 19:31 +08:00)

- Release code commit: `d5f2e408259047dd4d747905fac387d22a89b7ff`
- GitHub remote SHA before deployment: `d5f2e408259047dd4d747905fac387d22a89b7ff`
- CloudBase env / function: `cloud1-d4gy8l52g08bba326` / `api`
- Runtime / state: `Nodejs16.13` / `Active` / `Available`
- Deployment modification time: `2026-09-03 19:31:00`
- Deployment source: clean `git archive` of the release commit; 122 tracked files; no `node_modules`
- Deployment scope: code only; environment variables, permissions, triggers, runtime and production data were not changed
- `ping` smoke request: success, `pong`, expected environment returned
- Public error contract smoke: unauthenticated worker action returned numeric `code: 403` and stable `error: WORKER_AUTH_FAILED`
- Mini Program upload: NOT PERFORMED
- Live LangGraph smoke: `MANUAL_REQUIRED`

### Additional review fixes

1. Added a transaction-backed singleton claim for each participant's active date-coordinator session. Concurrent duplicate event delivery no longer creates four sessions for two participants.
2. Added atomic notification read handling. Notification rows and unread cursor are updated in one transaction, while the client sends a visible notification watermark so newly arrived messages remain unread.
3. Corrected the public error response schema: `code` is numeric HTTP-style status; `error` is the stable business code.
4. Repaired a notification concurrency selfcheck that previously exited with an unresolved Promise before reaching its assertions; refreshed two stale fixture/UI test contracts.
5. Added `project-docs/DATE_COORDINATION_RELIABILITY_ARCHITECTURE_2026-09-03.md`, including the next outbox, observability and controlled historical-session cleanup stages.

### Final gates

All commands passed immediately before commit/deployment:

- `npm --prefix server run selfcheck:agent`
- `npm --prefix server run selfcheck:safety`
- `npm --prefix server run selfcheck:ai-report`
- `npm --prefix server run selfcheck:cloudpay`
- `npm --prefix server run selfcheck:member`
- `npm --prefix server run selfcheck:cloud-match`
- `npm --prefix server run selfcheck:date-counter-offer`
- `npm --prefix server run selfcheck:date-qa-reset`
- `npm --prefix server run selfcheck:release-guard`
- `git diff --check` and `node --check` for changed production JavaScript
