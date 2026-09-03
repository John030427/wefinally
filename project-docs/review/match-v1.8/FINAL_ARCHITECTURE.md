# FINAL_ARCHITECTURE

FINAL_DECISION:
DETERMINISTIC_CORE + HY3_PROFILE_REASONING_STAGING + HY3_COORDINATION (RAG off; no public-data ML in production)

```
User profile/preferences
  → safe AI Profile layer (staging HY3 if enabled)
  → DETERMINISTIC HARD GATES
  → candidate pool
  → DETERMINISTIC CORE RANKING
  → bilateral eligibility / confidence
  → Top1 OR NO MATCH THIS CYCLE
  → HY3 report/explanation (staging)
  → AI coordinator
  → separate A/B confirmation
  → official offline coordination
```

Invariants: MODEL NEVER WRITES DB; NEVER BYPASSES HARD GATES; NEVER SEES PHONE/OPENID/EXACT ADDRESS; NO USER-USER PRIVATE CHAT; NO FABRICATED 110 LINK.
