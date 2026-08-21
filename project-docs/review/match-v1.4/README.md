# Match Reciprocal v1.4 — Review Bundle

## Answers

1. **Was AUROC/AUPRC wrong?** Yes — trapezoid PR mislabeled as AUPRC; ties order-dependent; constants not 0.5/prevalence.
2. **Fixed?** Tie-aware AUROC + Average Precision; PR_AUC_TRAPEZOID renamed separately.
3. **Identity trustworthy?** PASS_WITH_UNCERTAINTY — fingerprint reconstruction; mark IDENTITY_RECONSTRUCTION_UNCERTAIN.
4. **Multiple real encounters?** Candidate median=14; with_ge5=73.
5. **Excluded post-interaction?** like, *_partner, attractive_o, decision/match — see feature timing audit.
6. **Why directional LR?** Learns P(A→B) from prefs/alignment; mutual is harder/rarer.
7. **Best reciprocal?** RECIP_LOGIT_META
8. **Asymmetry penalty?** See RECIP_ASYMMETRY_PENALTY vs MIN/PRODUCT in METRICS.json.
9. **Calibration?** Platt fitted on CAL; keep score≠probability.
10. **Abstention?** Higher thresholds raise precision_when_recommend, lower coverage.
11. **HY3?** BLOCKED_BY_EXTERNAL_MANUAL_ACTION
12. **HY3 help?** N/A
13. **RAG?** RAG_NOT_TESTED_MEANINGFULLY
14. **DEV champion?** NO_CLEAR_CHAMPION
15. **Statistically meaningful?** Mostly small AP deltas — treat as exploratory.
16. **Fresh sealed?** NO_FRESH_SEALED_AVAILABLE
17. **Unproven?** Native iid/pid identity; production transfer; live hy3.
18. **Production?** KEEP_CURRENT_PRODUCTION
