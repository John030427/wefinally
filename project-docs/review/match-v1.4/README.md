# Match Reciprocal v1.4 — Review Bundle

## Review-fix (this round)

See [REVIEW_FIXES.md](REVIEW_FIXES.md). No model re-optimization; metric/provenance/isolation only.

## Answers

1. **Was AUROC/AUPRC wrong?** Yes initially; **mixed-tie AP also wrong** until review-fix (now distinct-threshold / sklearn-compatible).
2. **Fixed?** Tie-aware AUROC; AP by distinct thresholds; PR_AUC_TRAPEZOID separate; mixed-tie permutation tests PASS.
3. **Identity trustworthy?** **IDENTITY_RECONSTRUCTION_UNCERTAIN** (fingerprint). Native iid/pid migration path documented; not auto-downloaded.
4. **Multiple real encounters?** Candidate median≈14; with_ge5>0 under fingerprint reconstruction.
5. **Excluded post-interaction?** like, *_partner, attractive_o, decision/match.
6. **Why directional LR?** Learns P(A→B) from prefs/alignment; mutual rarer/harder.
7. **Best reciprocal?** See METRICS.json / RECIPROCAL_EXPERIMENTS.md (DEV snapshot after metric fix).
8. **Asymmetry penalty?** Documented in METRICS.json.
9. **Calibration?** Platt now fits/applies the **same** `scoreFns[bestRecip]` (provenance FIXED).
10. **Abstention?** Threshold sims unchanged in intent.
11. **HY3?** BLOCKED_BY_EXTERNAL_MANUAL_ACTION
12. **HY3 help?** N/A
13. **RAG?** RAG_NOT_TESTED_MEANINGFULLY
14. **DEV champion?** NO_CLEAR_CHAMPION
15. **Statistically meaningful?** Small AP deltas — exploratory.
16. **Fresh sealed?** NO_FRESH_SEALED_AVAILABLE (prior consumed; generation now physically isolates gold).
17. **Unproven?** Native iid/pid; production transfer; live hy3.
18. **Production?** KEEP_CURRENT_PRODUCTION
