# FINAL_ARCHITECTURE

FINAL_DECISION:
DETERMINISTIC_ONLY_CORE + HY3_COORDINATION_ONLY

## Diagram

```
Profile / preferences
        ↓
AI profile understanding — deferred until HY3 safety-cleared for product reasoning
        ↓
DETERMINISTIC HARD GATES  (always)
        ↓
candidate pool
        ↓
DETERMINISTIC_RANKER / rules  (sparse ML not locked for production)
        ↓
bilateral confirmation logic
        ↓
confidence + abstention → Top1 or NO MATCH THIS CYCLE
        ↓
HY3: coordination / explanation only if separately gated
        ↓
AI coordinator state machine
```

MODEL NEVER WRITES DB  
MODEL NEVER BYPASSES HARD GATES

## Role separation

| Component | Owner |
|-----------|-------|
| Hard gates | Deterministic |
| DB/permissions | Deterministic |
| Core ranking | Deterministic for now (sparse ML unstable on locked holdout) |
| HY3 | Coordination-first; profile reasoning needs more safety passes |
| RAG | Off |
| Compatibility score | Not a calibrated relationship probability |

## Production

**KEEP_CURRENT_PRODUCTION**

Optional later: CANDIDATE_FOR_STAGING_V1_8 only after v1.8 WeChat staging E2E — not from this offline tournament alone.
