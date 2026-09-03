# UX State Machine

```
idle
  │ onSend (text valid, !sending)
  ▼
append user(completed) + assistant(generating)
  │ start waiting-copy timer
  │ sending=true
  ▼
await fetchCompleteAssistantReply
  │ platform_service: agent → legacy fallback (same generating bubble)
  │ normalize content + optional patchPreview
  ▼
min loader duration (≈400ms)
  │
  ├─ success → same id: status=completed (+ patchPreview if valid)
  └─ failure → same id: status=error (+ retry)
  │
  ▼
sending=false; clear timers

error
  │ retryAiMessage
  ▼
same assistant id → generating (no new user bubble)
```

Message `status`: `generating` | `completed` | `error`.

Identity: `requestId` + `pendingMessageId` — responses never replace by “last array item”.
