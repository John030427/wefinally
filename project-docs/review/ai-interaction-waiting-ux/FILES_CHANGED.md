# Files Changed

| File | Change |
|---|---|
| `miniprogram/utils/aiChatWaiting.js` | Waiting helpers + **completion gate** (`evaluateAssistantReply` / `resolveCompleteAssistantReply`) |
| `miniprogram/pages/chat/chat.js` | Explicit generating/completed/error lifecycle; no generic empty-success fallback |
| `miniprogram/pages/chat/chat.wxml` | Generating bubble, error+retry, patch only when completed |
| `miniprogram/pages/chat/chat.wxss` | Ring spinner + reveal transition |
| `server/selfcheck/ai-chat-waiting-ux.js` | Helper + **full completion-gate cases** |
| `server/selfcheck/agent-ui.js` | Assert waiting UX + no fake fallback |
| `project-docs/review/ai-interaction-waiting-ux/*` | Review bundle |

No dependency / package.json changes. No CloudBase / WeChat upload.
