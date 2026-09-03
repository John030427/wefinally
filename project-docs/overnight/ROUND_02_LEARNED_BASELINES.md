# ROUND_02 — Learned Baselines

## Hypothesis
Structured PRE_MATCH features contain learnable directional signal beyond heuristics.

## LR coefficients (top |w|)
```json
[
  {
    "name": "bp_sinc",
    "w": -0.10250167619995205
  },
  {
    "name": "ap_shared",
    "w": 0.08693881459884457
  },
  {
    "name": "age_a",
    "w": 0.0837372513050825
  },
  {
    "name": "bp_shared",
    "w": -0.07155062207870996
  },
  {
    "name": "ap_attr",
    "w": -0.06818720921881784
  },
  {
    "name": "age_b",
    "w": -0.06738795248912045
  },
  {
    "name": "self_attr",
    "w": -0.06314235715460738
  },
  {
    "name": "ap_sinc",
    "w": 0.06182153453914937
  },
  {
    "name": "int_movies",
    "w": -0.05992447306081932
  },
  {
    "name": "ap_funny",
    "w": 0.05176459869911672
  }
]
```

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
  },
  "LR_DIR_PRODUCT": {
    "n": 920,
    "AUPRC": 0.2149,
    "AUROC": 0.5358,
    "MCC": 0.066,
    "Precision": 0.2267,
    "Recall": 0.4148,
    "F1": 0.2932,
    "balanced_accuracy": 0.54,
    "accuracy": 0.6174,
    "TP": 73,
    "one_sided_FP": 0.1859,
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
    "Brier": 0.1751,
    "ECE": 0.1413,
    "F1_ci95": {
      "lo": 0.278,
      "hi": 0.3196,
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
      "FALSE_NEGATIVE_MUTUAL": 103,
      "LOW_SCORE_TRUE_POSITIVE": 103,
      "ONE_SIDED_FALSE_POSITIVE": 171,
      "FALSE_POSITIVE_MUTUAL": 78
    }
  },
  "LR_DIR_MIN": {
    "n": 920,
    "AUPRC": 0.2003,
    "AUROC": 0.5149,
    "MCC": 0.0027,
    "Precision": 0.1914,
    "Recall": 0.9886,
    "F1": 0.3207,
    "balanced_accuracy": 0.5004,
    "accuracy": 0.1989,
    "TP": 174,
    "one_sided_FP": 0.5304,
    "P_at_1": 0.3562,
    "P_at_3": 0.2329,
    "NDCG_at_1": 0.3562,
    "NDCG_at_3": 0.309,
    "NDCG_at_5": 0.3602,
    "MRR": 0.4719,
    "RNDCG": 0.3326,
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
    "Brier": 0.2546,
    "ECE": 0.3116,
    "F1_ci95": {
      "lo": 0.2857,
      "hi": 0.381,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.589,
      "precision_at_3": 0.5479,
      "ndcg_at_1": 0.589,
      "ndcg_at_3": 0.5669,
      "ndcg_at_5": 0.5863,
      "MRR": 0.7141
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 488,
      "FALSE_POSITIVE_MUTUAL": 247,
      "FALSE_NEGATIVE_MUTUAL": 2,
      "LOW_SCORE_TRUE_POSITIVE": 2
    }
  },
  "LR_DIR_GEOM": {
    "n": 920,
    "AUPRC": 0.2149,
    "AUROC": 0.5358,
    "MCC": 0,
    "Precision": 0.1913,
    "Recall": 1,
    "F1": 0.3212,
    "balanced_accuracy": 0.5,
    "accuracy": 0.1913,
    "TP": 176,
    "one_sided_FP": 0.5359,
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
    "Brier": 0.3013,
    "ECE": 0.3825,
    "F1_ci95": {
      "lo": 0.2849,
      "hi": 0.3824,
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
      "ONE_SIDED_FALSE_POSITIVE": 493,
      "FALSE_POSITIVE_MUTUAL": 251
    }
  },
  "GBDT_DIR_PRODUCT": {
    "n": 920,
    "AUPRC": 0.2491,
    "AUROC": 0.5605,
    "MCC": 0.0365,
    "Precision": 0.1989,
    "Recall": 0.8125,
    "F1": 0.3196,
    "balanced_accuracy": 0.5192,
    "accuracy": 0.338,
    "TP": 143,
    "one_sided_FP": 0.4185,
    "P_at_1": 0.2877,
    "P_at_3": 0.2237,
    "NDCG_at_1": 0.2877,
    "NDCG_at_3": 0.2794,
    "NDCG_at_5": 0.3435,
    "MRR": 0.4344,
    "RNDCG": 0.2835,
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
    "Brier": 0.1866,
    "ECE": 0.182,
    "F1_ci95": {
      "lo": 0.2845,
      "hi": 0.383,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5479,
      "precision_at_3": 0.4886,
      "ndcg_at_1": 0.5479,
      "ndcg_at_3": 0.506,
      "ndcg_at_5": 0.5304,
      "MRR": 0.6744
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 385,
      "FALSE_NEGATIVE_MUTUAL": 33,
      "LOW_SCORE_TRUE_POSITIVE": 33,
      "FALSE_POSITIVE_MUTUAL": 191
    }
  },
  "GBDT_DIR_MIN": {
    "n": 920,
    "AUPRC": 0.2039,
    "AUROC": 0.5418,
    "MCC": 0,
    "Precision": 0.1913,
    "Recall": 1,
    "F1": 0.3212,
    "balanced_accuracy": 0.5,
    "accuracy": 0.1913,
    "TP": 176,
    "one_sided_FP": 0.5359,
    "P_at_1": 0.2603,
    "P_at_3": 0.1872,
    "NDCG_at_1": 0.2603,
    "NDCG_at_3": 0.2303,
    "NDCG_at_5": 0.3067,
    "MRR": 0.3958,
    "RNDCG": 0.2453,
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
    "Brier": 0.2955,
    "ECE": 0.3759,
    "F1_ci95": {
      "lo": 0.2849,
      "hi": 0.3824,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.6301,
      "precision_at_3": 0.4795,
      "ndcg_at_1": 0.6301,
      "ndcg_at_3": 0.5387,
      "ndcg_at_5": 0.5684,
      "MRR": 0.7414
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 493,
      "FALSE_POSITIVE_MUTUAL": 251
    }
  },
  "LR_MUTUAL": {
    "n": 920,
    "AUPRC": 0.2782,
    "AUROC": 0.6274,
    "MCC": 0.1375,
    "Precision": 0.2559,
    "Recall": 0.5511,
    "F1": 0.3495,
    "balanced_accuracy": 0.5861,
    "accuracy": 0.6076,
    "TP": 97,
    "one_sided_FP": 0.2022,
    "P_at_1": 0.3288,
    "P_at_3": 0.2374,
    "NDCG_at_1": 0.3288,
    "NDCG_at_3": 0.3128,
    "NDCG_at_5": 0.3642,
    "MRR": 0.4737,
    "RNDCG": 0.3208,
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
    "Brier": 0.1721,
    "ECE": 0.1489,
    "F1_ci95": {
      "lo": 0.3201,
      "hi": 0.3963,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.589,
      "precision_at_3": 0.4749,
      "ndcg_at_1": 0.589,
      "ndcg_at_3": 0.5,
      "ndcg_at_5": 0.5173,
      "MRR": 0.6987
    },
    "failure_types": {
      "FALSE_NEGATIVE_MUTUAL": 79,
      "LOW_SCORE_TRUE_POSITIVE": 79,
      "ONE_SIDED_FALSE_POSITIVE": 186,
      "FALSE_POSITIVE_MUTUAL": 96
    }
  },
  "GBDT_MUTUAL": {
    "n": 920,
    "AUPRC": 0.2464,
    "AUROC": 0.5498,
    "MCC": 0.0278,
    "Precision": 0.1919,
    "Recall": 1,
    "F1": 0.322,
    "balanced_accuracy": 0.502,
    "accuracy": 0.1946,
    "TP": 176,
    "one_sided_FP": 0.5359,
    "P_at_1": 0.274,
    "P_at_3": 0.2329,
    "NDCG_at_1": 0.274,
    "NDCG_at_3": 0.292,
    "NDCG_at_5": 0.3322,
    "MRR": 0.4234,
    "RNDCG": 0.283,
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
    "Brier": 0.2671,
    "ECE": 0.3358,
    "F1_ci95": {
      "lo": 0.2849,
      "hi": 0.3852,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5342,
      "precision_at_3": 0.4658,
      "ndcg_at_1": 0.5342,
      "ndcg_at_3": 0.4799,
      "ndcg_at_5": 0.5044,
      "MRR": 0.6593
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 493,
      "FALSE_POSITIVE_MUTUAL": 248
    }
  }
}
```

## Champion: LR_MUTUAL
Reason: improved AUPRCΔ=0.0633 MCCΔ=0.0715
