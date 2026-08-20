# ROUND_01 — Ranking Benchmark

## Hypothesis
Fingerprint identity reconstruction yields real multi-candidate ranking queries.

## Changes
- speedDatingV13 fingerprint iid/pid
- PRE_MATCH feature mapping + timing audit
- Wave split TRAIN/CAL/DEV/SEALED
- Directed ranking query = iid::wave

## Integrity
Candidate median on DEV: **14** (must > 1) — PASS

## DEV metrics
```json
{
  "Z_RANDOM": {
    "n": 920,
    "AUPRC": 0.1862,
    "AUROC": 0.4746,
    "MCC": 0.0259,
    "Precision": 0.2018,
    "Recall": 0.5114,
    "F1": 0.2894,
    "balanced_accuracy": 0.5164,
    "accuracy": 0.5196,
    "TP": 90,
    "one_sided_FP": 0.25,
    "P_at_1": 0.2192,
    "P_at_3": 0.2055,
    "NDCG_at_1": 0.2192,
    "NDCG_at_3": 0.2437,
    "NDCG_at_5": 0.2957,
    "MRR": 0.3957,
    "RNDCG": 0.2314,
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
    "Brier": 0.3421,
    "ECE": 0.3691,
    "F1_ci95": {
      "lo": 0.2581,
      "hi": 0.336,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.4795,
      "precision_at_3": 0.4932,
      "ndcg_at_1": 0.4795,
      "ndcg_at_3": 0.4949,
      "ndcg_at_5": 0.4982,
      "MRR": 0.6476
    },
    "failure_types": {
      "FALSE_NEGATIVE_MUTUAL": 86,
      "ONE_SIDED_FALSE_POSITIVE": 230,
      "FALSE_POSITIVE_MUTUAL": 126
    }
  },
  "Z_ALL_NEGATIVE": {
    "n": 920,
    "AUPRC": 0.2599,
    "AUROC": 0.5624,
    "MCC": 0,
    "Precision": 0,
    "Recall": 0,
    "F1": 0,
    "balanced_accuracy": 0.5,
    "accuracy": 0.8087,
    "TP": 0,
    "one_sided_FP": 0,
    "P_at_1": 0.137,
    "P_at_3": 0.1918,
    "NDCG_at_1": 0.137,
    "NDCG_at_3": 0.2094,
    "NDCG_at_5": 0.277,
    "MRR": 0.3373,
    "RNDCG": 0.1732,
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
    "Brier": 0.1913,
    "ECE": 0.1913,
    "F1_ci95": {
      "lo": 0,
      "hi": 0,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5616,
      "precision_at_3": 0.4932,
      "ndcg_at_1": 0.5616,
      "ndcg_at_3": 0.521,
      "ndcg_at_5": 0.5432,
      "MRR": 0.6948
    },
    "failure_types": {
      "FALSE_NEGATIVE_MUTUAL": 176,
      "LOW_SCORE_TRUE_POSITIVE": 176
    }
  },
  "Z_ALL_POSITIVE": {
    "n": 920,
    "AUPRC": 0.2599,
    "AUROC": 0.5624,
    "MCC": 0,
    "Precision": 0.1913,
    "Recall": 1,
    "F1": 0.3212,
    "balanced_accuracy": 0.5,
    "accuracy": 0.1913,
    "TP": 176,
    "one_sided_FP": 0.5359,
    "P_at_1": 0.137,
    "P_at_3": 0.1918,
    "NDCG_at_1": 0.137,
    "NDCG_at_3": 0.2094,
    "NDCG_at_5": 0.277,
    "MRR": 0.3373,
    "RNDCG": 0.1732,
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
    "Brier": 0.8087,
    "ECE": 0.8087,
    "F1_ci95": {
      "lo": 0.2849,
      "hi": 0.3824,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5616,
      "precision_at_3": 0.4932,
      "ndcg_at_1": 0.5616,
      "ndcg_at_3": 0.521,
      "ndcg_at_5": 0.5432,
      "MRR": 0.6948
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 493,
      "HIGH_SCORE_FALSE_POSITIVE": 744,
      "FALSE_POSITIVE_MUTUAL": 251
    }
  },
  "A": {
    "n": 920,
    "AUPRC": 0.2533,
    "AUROC": 0.6205,
    "MCC": 0.0137,
    "Precision": 0.1925,
    "Recall": 0.9602,
    "F1": 0.3207,
    "balanced_accuracy": 0.5036,
    "accuracy": 0.2217,
    "TP": 169,
    "one_sided_FP": 0.5228,
    "P_at_1": 0.2466,
    "P_at_3": 0.2603,
    "NDCG_at_1": 0.2466,
    "NDCG_at_3": 0.3047,
    "NDCG_at_5": 0.3591,
    "MRR": 0.427,
    "RNDCG": 0.2756,
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
    "Brier": 0.4856,
    "ECE": 0.5708,
    "F1_ci95": {
      "lo": 0.2878,
      "hi": 0.3789,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5205,
      "precision_at_3": 0.5342,
      "ndcg_at_1": 0.5205,
      "ndcg_at_3": 0.547,
      "ndcg_at_5": 0.5564,
      "MRR": 0.6657
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 481,
      "HIGH_SCORE_FALSE_POSITIVE": 453,
      "FALSE_NEGATIVE_MUTUAL": 7,
      "LOW_SCORE_TRUE_POSITIVE": 6,
      "FALSE_POSITIVE_MUTUAL": 228
    }
  },
  "B": {
    "n": 920,
    "AUPRC": 0.2392,
    "AUROC": 0.5666,
    "MCC": 0.072,
    "Precision": 0.2061,
    "Recall": 0.8466,
    "F1": 0.3315,
    "balanced_accuracy": 0.5375,
    "accuracy": 0.3467,
    "TP": 149,
    "one_sided_FP": 0.4326,
    "P_at_1": 0.2603,
    "P_at_3": 0.2374,
    "NDCG_at_1": 0.2603,
    "NDCG_at_3": 0.2711,
    "NDCG_at_5": 0.3088,
    "MRR": 0.408,
    "RNDCG": 0.2657,
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
    "Brier": 0.3941,
    "ECE": 0.4879,
    "F1_ci95": {
      "lo": 0.2904,
      "hi": 0.3977,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5205,
      "precision_at_3": 0.4977,
      "ndcg_at_1": 0.5205,
      "ndcg_at_3": 0.5211,
      "ndcg_at_5": 0.5342,
      "MRR": 0.6638
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 398,
      "FALSE_NEGATIVE_MUTUAL": 27,
      "HIGH_SCORE_FALSE_POSITIVE": 144,
      "FALSE_POSITIVE_MUTUAL": 176
    }
  },
  "C": {
    "n": 920,
    "AUPRC": 0.2532,
    "AUROC": 0.6196,
    "MCC": 0.0233,
    "Precision": 0.1935,
    "Recall": 0.9545,
    "F1": 0.3218,
    "balanced_accuracy": 0.5068,
    "accuracy": 0.2304,
    "TP": 168,
    "one_sided_FP": 0.5174,
    "P_at_1": 0.2466,
    "P_at_3": 0.2603,
    "NDCG_at_1": 0.2466,
    "NDCG_at_3": 0.3039,
    "NDCG_at_5": 0.3583,
    "MRR": 0.4247,
    "RNDCG": 0.2752,
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
    "Brier": 0.4882,
    "ECE": 0.5732,
    "F1_ci95": {
      "lo": 0.2896,
      "hi": 0.3788,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5205,
      "precision_at_3": 0.5388,
      "ndcg_at_1": 0.5205,
      "ndcg_at_3": 0.5502,
      "ndcg_at_5": 0.5588,
      "MRR": 0.6657
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 476,
      "HIGH_SCORE_FALSE_POSITIVE": 453,
      "FALSE_NEGATIVE_MUTUAL": 8,
      "LOW_SCORE_TRUE_POSITIVE": 6,
      "FALSE_POSITIVE_MUTUAL": 224
    }
  },
  "D": {
    "n": 920,
    "AUPRC": 0.2532,
    "AUROC": 0.6155,
    "MCC": 0.0183,
    "Precision": 0.1934,
    "Recall": 0.9318,
    "F1": 0.3203,
    "balanced_accuracy": 0.5062,
    "accuracy": 0.2435,
    "TP": 164,
    "one_sided_FP": 0.5087,
    "P_at_1": 0.274,
    "P_at_3": 0.2374,
    "NDCG_at_1": 0.274,
    "NDCG_at_3": 0.2829,
    "NDCG_at_5": 0.3426,
    "MRR": 0.4359,
    "RNDCG": 0.2784,
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
    "Brier": 0.4911,
    "ECE": 0.5789,
    "F1_ci95": {
      "lo": 0.2842,
      "hi": 0.3834,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.589,
      "precision_at_3": 0.516,
      "ndcg_at_1": 0.589,
      "ndcg_at_3": 0.5475,
      "ndcg_at_5": 0.5581,
      "MRR": 0.7017
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 468,
      "HIGH_SCORE_FALSE_POSITIVE": 438,
      "FALSE_NEGATIVE_MUTUAL": 12,
      "LOW_SCORE_TRUE_POSITIVE": 6,
      "FALSE_POSITIVE_MUTUAL": 216
    }
  },
  "E": {
    "n": 920,
    "AUPRC": 0.2532,
    "AUROC": 0.6155,
    "MCC": 0.0183,
    "Precision": 0.1934,
    "Recall": 0.9318,
    "F1": 0.3203,
    "balanced_accuracy": 0.5062,
    "accuracy": 0.2435,
    "TP": 164,
    "one_sided_FP": 0.5087,
    "P_at_1": 0.274,
    "P_at_3": 0.2374,
    "NDCG_at_1": 0.274,
    "NDCG_at_3": 0.2829,
    "NDCG_at_5": 0.3426,
    "MRR": 0.4359,
    "RNDCG": 0.2784,
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
    "Brier": 0.4911,
    "ECE": 0.5789,
    "F1_ci95": {
      "lo": 0.2842,
      "hi": 0.3834,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.589,
      "precision_at_3": 0.516,
      "ndcg_at_1": 0.589,
      "ndcg_at_3": 0.5475,
      "ndcg_at_5": 0.5581,
      "MRR": 0.7017
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 468,
      "HIGH_SCORE_FALSE_POSITIVE": 438,
      "FALSE_NEGATIVE_MUTUAL": 12,
      "LOW_SCORE_TRUE_POSITIVE": 6,
      "FALSE_POSITIVE_MUTUAL": 216
    }
  }
}
```

## Promotion decision
Benchmark correctness established. No model promotion yet.
