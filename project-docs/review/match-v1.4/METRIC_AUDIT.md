# Metric Audit v1.4 (+ review-fix)

## Original finding

Previous `AUPRC` was PR trapezoid with spurious (0,1) start and order-dependent ties. Constants ≠ AUROC 0.5 / AP=prevalence.

## Review-fix (REVIEW-01)

First fix still accumulated AP **row-by-row within mixed ties** (index order). That is **not** sklearn `average_precision_score`.

**Now:** distinct descending score thresholds; within a group only `(n_pos, n_neg)` used.

```
AP = Σ_t (R_t − R_{t−1}) · P_t
```

`PR_AUC_TRAPEZOID` uses the same distinct groups (tie-invariant).

## Tests

- CONSTANT_* / PERFECT_* / INVERSE_* / RANDOM_*
- MIXED_TIE_AP_PERMUTATION_INVARIANT
- MIXED_TIE_AP_SKLEARN_MATCH
- MIXED_TIE_TRAP_PERMUTATION_INVARIANT

Module: `server/data/wefinally/eval/binaryRankingMetrics.js`
