# Match Native ID v1.5 — Review Bundle

## Answers

1. **Was ranking tie order dependence fixed?** Yes — expected P@K / NDCG / MRR under uniform random within equal-score groups (`rankingTieAware.js`).
2. **Did we obtain native iid/pid?** **No** — `WAITING_NATIVE_ID_DATA`. OpenML CSV lacks iid/pid; native file not present at `datasets/wefinally/raw/speed-dating/speed-dating-native-iid-pid.csv`.
3. **From what exact source/license?** Prefer Columbia ARM example / Fisman–Iyengar scholarly release (see NATIVE_DATA_SOURCE_AUDIT.md). License gate remains **REVIEW_REQUIRED**, rag=false. No ungated mirror download performed.
4. **How many native participants?** N/A until native file provided.
5. **How many directed encounters?** N/A (native); OpenML fingerprint path still has 8378 directed rows but **PAIR_IDENTITY_UNCERTAIN**.
6. **How many true physical pairs?** N/A — `TRUE_CANONICAL_PAIR` only with native IDs.
7. **What fraction have exact reverse rows?** N/A until native.
8. **Was fingerprint canonical pairing invalid/uncertain?** **Yes — PAIR_IDENTITY_UNCERTAIN.** subjectFingerprint ≠ partnerFingerprint schema; not true reciprocal.
9. **Does P(B→A) now use B's actual subject record?** Required for true reciprocal; **blocked** without native reverse rows. Swapped-vector `xRev` **removed**.
10. **How did v1.4 results change?** v1.4 RECIP_* conclusions **invalidated** as true A↔B claims. Exploratory only under uncertain partner identity.
11. **Which reciprocal aggregator is best now?** **N/A** — TRUE_RECIPROCAL_AVAILABLE=false; aggregators not run.
12. **Are gains clear or still exploratory?** Exploratory / blocked pending native data.
13. **HY3 status?** BLOCKED_BY_EXTERNAL_MANUAL_ACTION
14. **Production recommendation?** KEEP_CURRENT_PRODUCTION — no production match changes.

## Status

| Gate | Status |
|------|--------|
| Ranking ties | FIXED |
| Native iid/pid | WAITING_NATIVE_ID_DATA |
| True reciprocal | BLOCKED |
| Fresh sealed | NO_FRESH_SEALED_AVAILABLE |
| Validation type | DEV / RETROSPECTIVE only |
