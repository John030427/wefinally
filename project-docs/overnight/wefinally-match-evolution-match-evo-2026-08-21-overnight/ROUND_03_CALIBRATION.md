# ROUND_03 — Calibration & Thresholds

## Hypothesis
Platt calibration on CALIBRATION improves probability quality; thresholds enable HIGH_PRECISION / BALANCED / HIGH_RECALL operating points. compatibility_score ≠ probability.

## Calibrated DEV
```json
{
  "n": 920,
  "AUPRC": 0.2149,
  "AUROC": 0.5358,
  "MCC": 0,
  "Precision": 0,
  "Recall": 0,
  "F1": 0,
  "balanced_accuracy": 0.5,
  "accuracy": 0.8087,
  "TP": 0,
  "one_sided_FP": 0,
  "P_at_1": 0.2466,
  "P_at_3": 0.2374,
  "NDCG_at_1": 0.2466,
  "NDCG_at_3": 0.2899,
  "NDCG_at_5": 0.345,
  "MRR": 0.4268,
  "RNDCG": 0.2682,
  "query_stats": {
    "n_queries": 73,
    "min": 10,
    "median": 14,
    "mean": 12.6027,
    "p90": 15,
    "max": 15,
    "with_ge2": 73,
    "with_ge3": 73,
    "with_ge5": 73,
    "with_ge10": 73
  },
  "Brier": 0.1627,
  "ECE": 0.091,
  "F1_ci95": {
    "lo": 0,
    "hi": 0,
    "method": "bootstrap_wave_cluster",
    "rounds": 200
  },
  "directional_ranking": {
    "precision_at_1": 0.5068,
    "precision_at_3": 0.5297,
    "ndcg_at_1": 0.5068,
    "ndcg_at_3": 0.5328,
    "ndcg_at_5": 0.5382,
    "MRR": 0.6644
  },
  "failure_types": {
    "FALSE_NEGATIVE_MUTUAL": 176,
    "LOW_SCORE_TRUE_POSITIVE": 176
  }
}
```

## Operating points
```json
{
  "HIGH_PRECISION": {
    "threshold": 0.3,
    "precision": 0.25,
    "recall": 0.0057,
    "F1": 0.0111,
    "one_sided_FP": 0.0022,
    "positive_rate": 0.0043
  },
  "BALANCED": {
    "threshold": 0.2,
    "precision": 0.1913,
    "recall": 1,
    "F1": 0.3212,
    "one_sided_FP": 0.5359,
    "positive_rate": 1
  },
  "HIGH_RECALL": {
    "threshold": 0.2,
    "precision": 0.1913,
    "recall": 1,
    "F1": 0.3212,
    "one_sided_FP": 0.5359,
    "positive_rate": 1
  },
  "all": [
    {
      "threshold": 0.2,
      "precision": 0.1913,
      "recall": 1,
      "F1": 0.3212,
      "one_sided_FP": 0.5359,
      "positive_rate": 1
    },
    {
      "threshold": 0.3,
      "precision": 0.25,
      "recall": 0.0057,
      "F1": 0.0111,
      "one_sided_FP": 0.0022,
      "positive_rate": 0.0043
    },
    {
      "threshold": 0.35,
      "precision": 0,
      "recall": 0,
      "F1": 0,
      "one_sided_FP": 0,
      "positive_rate": 0
    },
    {
      "threshold": 0.4,
      "precision": 0,
      "recall": 0,
      "F1": 0,
      "one_sided_FP": 0,
      "positive_rate": 0
    },
    {
      "threshold": 0.5,
      "precision": 0,
      "recall": 0,
      "F1": 0,
      "one_sided_FP": 0,
      "positive_rate": 0
    },
    {
      "threshold": 0.6,
      "precision": 0,
      "recall": 0,
      "F1": 0,
      "one_sided_FP": 0,
      "positive_rate": 0
    }
  ]
}
```

## Abstention simulation
```json
{
  "n_queries": 73,
  "always_top1_mutual_hit_rate": 0.2466,
  "abstain_threshold": 0.3,
  "coverage_rate": 0.0411,
  "precision_when_recommend": 0
}
```

## Champion: LR_MUTUAL
