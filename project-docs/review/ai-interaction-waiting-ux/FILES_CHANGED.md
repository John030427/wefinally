# Files Changed

| File | Change |
|---|---|
| `miniprogram/utils/aiChatWaiting.js` | NEW — pure waiting state helpers |
| `miniprogram/pages/chat/chat.js` | Explicit generating/completed/error lifecycle, retry, timers, complete-response gate |
| `miniprogram/pages/chat/chat.wxml` | Generating bubble, error+retry, patch only when completed |
| `miniprogram/pages/chat/chat.wxss` | Ring spinner + reveal transition |
| `server/selfcheck/ai-chat-waiting-ux.js` | NEW — helper + contract checks |
| `server/selfcheck/agent-ui.js` | Assert waiting UX contracts |
| `project-docs/review/ai-interaction-waiting-ux/*` | Review bundle |

No dependency / package.json changes. No CloudBase / WeChat upload.
