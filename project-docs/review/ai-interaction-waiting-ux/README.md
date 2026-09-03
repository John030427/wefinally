# AI Interaction Waiting UX — Review

## Answers (required)

1. **Which AI interaction surfaces were found?**  
   See `AI_INTERACTION_SURFACES.md` — conversational chat (3 agent types), structured AI profile/report, static disclosures, non-AI pages.

2. **Which surfaces were changed?**  
   Shared `miniprogram/pages/chat/` + `miniprogram/utils/aiChatWaiting.js` only.

3. **Is love_advisor covered by shared chat?**  
   Yes — routes to `/pages/chat/chat?agentType=love_advisor`.

4. **Is date_coordinator covered by shared chat?**  
   Yes — routes to `/pages/chat/chat?agentType=date_coordinator&coordinationId=…`.

5. **Does assistant loader appear immediately?**  
   Yes — on send, user bubble + generating assistant bubble are appended before the API call.

6. **Is loader inserted as a message bubble?**  
   Yes — same message list slot (`status: generating`).

7. **Does the same bubble become the final response?**  
   Yes — identity-based `replaceMessageById(pendingMessageId, …)`.

8. **Is there token streaming?**  
   No.

9. **What exactly marks COMPLETE?**  
   Full API response received → **non-empty assistant content OR valid normalized `patchPreview` (at least one)** → minimum loader duration elapsed → `status: completed`. Empty/malformed success payloads are rejected (no generic fake reply).

10. **For coordination, does completion wait for patch normalization?**  
    Yes — raw patch that fails `normalizePatchPreview` becomes error; **valid patch-only responses may complete**; patch UI only when `status=completed` and valid `patchPreview`.

11. **Is fake percentage progress used?**  
    No.

12. **What happens on slow AI?**  
    Loader continues; after ~8s secondary copy may become “还在处理中，请稍候…”; no frontend-shortened timeout.

13. **What happens on failure?**  
    Same bubble → `status: error` + “重新生成”; toast optional.

14. **Is retry supported?**  
    Yes — `retryAiMessage` reuses the same assistant bubble and original user text.

15. **Can retry duplicate the user message?**  
    No — retry sets `appendUser: false`.

16. **Are double sends blocked?**  
    Yes — `sending` guard; send button disabled / label “发送中” (no competing spinner).

17. **Are timers cleaned on unload?**  
    Yes — `onUnload` clears interval/timeout and sets `_pageActive=false`.

18. **Did existing patch confirmation still work?**  
    Yes — `patchSubmitting` path unchanged; contract selfcheck still covers patch confirm/cancel/primary resolution.

19. **Did platform-service fallback preserve one loader?**  
    Yes — primary throw **or** empty/malformed primary → legacy in the same generating turn; both empty → error bubble. No generic fake success.

20. **Are AI generation and patch submission different states?**  
    Yes — `sending` / message `status` vs `patchSubmitting`.

21. **Were any external Skills used?**  
    None — see `SKILLS_USED.md`.

22. **Was any dependency added?**  
    No.

23. **Was CloudBase deployed?**  
    No.

24. **Was Mini Program uploaded?**  
    No.

## Component decision

Shared chat is the only conversational AI surface for love_advisor / platform_service / date_coordinator. Implementation stays local to `pages/chat` + pure helper `utils/aiChatWaiting.js`. No separate `components/ai-generating-bubble` (avoid abstraction for one surface).

## Visual screenshots

`VISUAL_SCREENSHOT=MANUAL_REQUIRED` (WeChat DevTools login not available in this agent environment).
