# Error + Retry Behavior

On failure:

- Clear waiting timers
- Replace same assistant message: `status=error`, `errorText`
- Keep user message
- Optional toast
- Show `重新生成`

On retry:

- Requires `status=error` and retained `originalUserText`
- Same `pendingMessageId` → `generating`
- Does not append another user bubble
- Single-flight via `sending`
- No automatic multi-retry loop

On unload:

- `_pageActive=false`
- Timers cleared
- Late responses skip `setData`
