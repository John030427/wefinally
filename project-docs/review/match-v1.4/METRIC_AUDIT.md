# Metric Audit v1.4

## Finding
Previous `AUPRC` was **PR trapezoid area** with a spurious (0,1) start and **order-dependent ties**.
Constant predictors therefore did not yield AUROC=0.5 / AP=prevalence.

## Fix
- `AUROC`: Mann–Whitney mid-rank (tie-aware) → constant ⇒ 0.5
- `AVERAGE_PRECISION`: sklearn-style AP; constant ⇒ prevalence
- `PR_AUC_TRAPEZOID`: separate name
- `AUPRC` alias now means **AVERAGE_PRECISION**

Module: `server/data/wefinally/eval/binaryRankingMetrics.js`
Selfcheck: `selfcheck:match-eval-metrics-v14`
