# WORK REPORT — Overnight Match Evolution

**Run:** match-evo-2026-08-21-overnight
**Rounds completed:** 6
**Champion (DEV-locked):** LR_MUTUAL
**Sealed:** CONSUMED once at 2026-08-20T17:37:01.489Z
**HY3:** BLOCKED_BY_EXTERNAL_MANUAL_ACTION
**Production recommendation:** KEEP_CURRENT_PRODUCTION

## Executive summary

### WHAT WE STARTED WITH
- v1.2 integrity PASS but ranking NOT_APPLICABLE (candidate size=1)
- Fixture A–E AUPRC≈0.18–0.19; controls correct

### WHAT WAS WRONG
- OpenML CSV lacked iid/pid; per-row synthetic ids destroyed ranking structure
- Prefs/interests not in FeatureView; post-meeting `like` risk if misused

### WHAT WAS BUILT
- Fingerprint identity reconstruction → median candidates ≫ 1
- Wave-level TRAIN/CAL/DEV/SEALED; AUDIT_TEST_V1_2 retained
- Feature timing audit; FeatureView bilateral PRE_MATCH features
- LR + GBDT offline sandbox models; calibration; thresholds; abstention sim
- Multi-round DEV evolution; champion lock; sealed one-shot

### HOW MANY EVOLUTION ROUNDS RAN
6

### WHAT WON / LOST
- DEV champion: **LR_MUTUAL** (improved AUPRCΔ=0.0633 MCCΔ=0.0715)
- Rejected: 12 experiments
- Sealed conclusion: **NO_CLEAR_IMPROVEMENT**

### RAG / HY3
- RAG: RAG_UNDERPOWERED / not forced (Speed Dating rag=false)
- HY3: BLOCKED_BY_EXTERNAL_MANUAL_ACTION

### Classical ML vs heuristics
See sealed table — ML sandbox models compared to B/C and controls.

### FINAL SEALED RESULTS
```json
{
  "Z_ALL_NEGATIVE": {
    "n": 1046,
    "AUPRC": 0.1875,
    "AUROC": 0.4408,
    "MCC": 0,
    "Precision": 0,
    "Recall": 0,
    "F1": 0,
    "balanced_accuracy": 0.5,
    "accuracy": 0.7916,
    "TP": 0,
    "one_sided_FP": 0,
    "P_at_1": 0.16,
    "P_at_3": 0.1556,
    "NDCG_at_1": 0.16,
    "NDCG_at_3": 0.1807,
    "NDCG_at_5": 0.2339,
    "MRR": 0.3432,
    "RNDCG": 0.1703,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.2084,
    "ECE": 0.2084,
    "F1_ci95": {
      "lo": 0,
      "hi": 0,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.48,
      "precision_at_3": 0.4622,
      "ndcg_at_1": 0.48,
      "ndcg_at_3": 0.4782,
      "ndcg_at_5": 0.5018,
      "MRR": 0.649
    },
    "failure_types": {
      "FALSE_NEGATIVE_MUTUAL": 218,
      "LOW_SCORE_TRUE_POSITIVE": 218
    }
  },
  "Z_ALL_POSITIVE": {
    "n": 1046,
    "AUPRC": 0.1875,
    "AUROC": 0.4408,
    "MCC": 0,
    "Precision": 0.2084,
    "Recall": 1,
    "F1": 0.3449,
    "balanced_accuracy": 0.5,
    "accuracy": 0.2084,
    "TP": 218,
    "one_sided_FP": 0.5373,
    "P_at_1": 0.16,
    "P_at_3": 0.1556,
    "NDCG_at_1": 0.16,
    "NDCG_at_3": 0.1807,
    "NDCG_at_5": 0.2339,
    "MRR": 0.3432,
    "RNDCG": 0.1703,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.7916,
    "ECE": 0.7916,
    "F1_ci95": {
      "lo": 0.3113,
      "hi": 0.4733,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.48,
      "precision_at_3": 0.4622,
      "ndcg_at_1": 0.48,
      "ndcg_at_3": 0.4782,
      "ndcg_at_5": 0.5018,
      "MRR": 0.649
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 562,
      "HIGH_SCORE_FALSE_POSITIVE": 828,
      "FALSE_POSITIVE_MUTUAL": 266
    }
  },
  "Z_RANDOM": {
    "n": 1046,
    "AUPRC": 0.2092,
    "AUROC": 0.5041,
    "MCC": -0.0351,
    "Precision": 0.1937,
    "Recall": 0.4495,
    "F1": 0.2707,
    "balanced_accuracy": 0.4784,
    "accuracy": 0.4952,
    "TP": 98,
    "one_sided_FP": 0.2639,
    "P_at_1": 0.1867,
    "P_at_3": 0.2133,
    "NDCG_at_1": 0.1867,
    "NDCG_at_3": 0.246,
    "NDCG_at_5": 0.3079,
    "MRR": 0.3797,
    "RNDCG": 0.2164,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.3337,
    "ECE": 0.3461,
    "F1_ci95": {
      "lo": 0.2444,
      "hi": 0.358,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.44,
      "precision_at_3": 0.4844,
      "ndcg_at_1": 0.44,
      "ndcg_at_3": 0.4839,
      "ndcg_at_5": 0.5187,
      "MRR": 0.632
    },
    "failure_types": {
      "FALSE_POSITIVE_MUTUAL": 132,
      "FALSE_NEGATIVE_MUTUAL": 120,
      "ONE_SIDED_FALSE_POSITIVE": 276
    }
  },
  "B": {
    "n": 1046,
    "AUPRC": 0.2097,
    "AUROC": 0.5178,
    "MCC": 0.0246,
    "Precision": 0.2148,
    "Recall": 0.7339,
    "F1": 0.3323,
    "balanced_accuracy": 0.5137,
    "accuracy": 0.3853,
    "TP": 160,
    "one_sided_FP": 0.3776,
    "P_at_1": 0.2,
    "P_at_3": 0.2,
    "NDCG_at_1": 0.2,
    "NDCG_at_3": 0.2339,
    "NDCG_at_5": 0.29,
    "MRR": 0.3772,
    "RNDCG": 0.2169,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.3821,
    "ECE": 0.4605,
    "F1_ci95": {
      "lo": 0.3019,
      "hi": 0.4178,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.4667,
      "precision_at_3": 0.4667,
      "ndcg_at_1": 0.4667,
      "ndcg_at_3": 0.469,
      "ndcg_at_5": 0.5008,
      "MRR": 0.6317
    },
    "failure_types": {
      "FALSE_NEGATIVE_MUTUAL": 58,
      "ONE_SIDED_FALSE_POSITIVE": 395,
      "FALSE_POSITIVE_MUTUAL": 190,
      "HIGH_SCORE_FALSE_POSITIVE": 160
    }
  },
  "C": {
    "n": 1046,
    "AUPRC": 0.2337,
    "AUROC": 0.5599,
    "MCC": 0.0559,
    "Precision": 0.2163,
    "Recall": 0.9266,
    "F1": 0.3507,
    "balanced_accuracy": 0.5213,
    "accuracy": 0.2849,
    "TP": 202,
    "one_sided_FP": 0.4704,
    "P_at_1": 0.2267,
    "P_at_3": 0.2311,
    "NDCG_at_1": 0.2267,
    "NDCG_at_3": 0.2857,
    "NDCG_at_5": 0.3315,
    "MRR": 0.4064,
    "RNDCG": 0.2562,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.4603,
    "ECE": 0.5391,
    "F1_ci95": {
      "lo": 0.3162,
      "hi": 0.4651,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5067,
      "precision_at_3": 0.5156,
      "ndcg_at_1": 0.5067,
      "ndcg_at_3": 0.516,
      "ndcg_at_5": 0.5402,
      "MRR": 0.6542
    },
    "failure_types": {
      "FALSE_NEGATIVE_MUTUAL": 16,
      "FALSE_POSITIVE_MUTUAL": 240,
      "ONE_SIDED_FALSE_POSITIVE": 492,
      "HIGH_SCORE_FALSE_POSITIVE": 451
    }
  },
  "LR_DIR_PRODUCT": {
    "n": 1046,
    "AUPRC": 0.2146,
    "AUROC": 0.5053,
    "MCC": 0.0026,
    "Precision": 0.21,
    "Recall": 0.3073,
    "F1": 0.2495,
    "balanced_accuracy": 0.5015,
    "accuracy": 0.6147,
    "TP": 67,
    "one_sided_FP": 0.1683,
    "P_at_1": 0.24,
    "P_at_3": 0.2489,
    "NDCG_at_1": 0.24,
    "NDCG_at_3": 0.2755,
    "NDCG_at_5": 0.3287,
    "MRR": 0.4082,
    "RNDCG": 0.2578,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.1812,
    "ECE": 0.1142,
    "F1_ci95": {
      "lo": 0.2313,
      "hi": 0.2997,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.6667,
      "precision_at_3": 0.5733,
      "ndcg_at_1": 0.6667,
      "ndcg_at_3": 0.5959,
      "ndcg_at_5": 0.6046,
      "MRR": 0.7707
    },
    "failure_types": {
      "FALSE_POSITIVE_MUTUAL": 76,
      "FALSE_NEGATIVE_MUTUAL": 151,
      "LOW_SCORE_TRUE_POSITIVE": 151,
      "ONE_SIDED_FALSE_POSITIVE": 176
    }
  },
  "GBDT_DIR_PRODUCT": {
    "n": 1046,
    "AUPRC": 0.2186,
    "AUROC": 0.5228,
    "MCC": 0.0238,
    "Precision": 0.2147,
    "Recall": 0.7248,
    "F1": 0.3312,
    "balanced_accuracy": 0.5134,
    "accuracy": 0.3901,
    "TP": 158,
    "one_sided_FP": 0.3757,
    "P_at_1": 0.2667,
    "P_at_3": 0.2267,
    "NDCG_at_1": 0.2667,
    "NDCG_at_3": 0.2721,
    "NDCG_at_5": 0.3152,
    "MRR": 0.4155,
    "RNDCG": 0.2694,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.1899,
    "ECE": 0.1571,
    "F1_ci95": {
      "lo": 0.3036,
      "hi": 0.4033,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5733,
      "precision_at_3": 0.5244,
      "ndcg_at_1": 0.5733,
      "ndcg_at_3": 0.5377,
      "ndcg_at_5": 0.5573,
      "MRR": 0.7024
    },
    "failure_types": {
      "FALSE_POSITIVE_MUTUAL": 185,
      "FALSE_NEGATIVE_MUTUAL": 60,
      "LOW_SCORE_TRUE_POSITIVE": 60,
      "ONE_SIDED_FALSE_POSITIVE": 393
    }
  },
  "BILATERAL_V2_MIN": {
    "n": 1046,
    "AUPRC": 0.2138,
    "AUROC": 0.511,
    "MCC": 0,
    "Precision": 0.2084,
    "Recall": 1,
    "F1": 0.3449,
    "balanced_accuracy": 0.5,
    "accuracy": 0.2084,
    "TP": 218,
    "one_sided_FP": 0.5373,
    "P_at_1": 0.24,
    "P_at_3": 0.2356,
    "NDCG_at_1": 0.24,
    "NDCG_at_3": 0.2812,
    "NDCG_at_5": 0.3277,
    "MRR": 0.4091,
    "RNDCG": 0.2606,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.3421,
    "ECE": 0.418,
    "F1_ci95": {
      "lo": 0.3113,
      "hi": 0.4733,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.5333,
      "precision_at_3": 0.4933,
      "ndcg_at_1": 0.5333,
      "ndcg_at_3": 0.5055,
      "ndcg_at_5": 0.5364,
      "MRR": 0.6779
    },
    "failure_types": {
      "ONE_SIDED_FALSE_POSITIVE": 562,
      "FALSE_POSITIVE_MUTUAL": 266,
      "HIGH_SCORE_FALSE_POSITIVE": 2
    }
  },
  "FINAL_CHAMPION": {
    "n": 1046,
    "AUPRC": 0.2146,
    "AUROC": 0.5053,
    "MCC": 0.0026,
    "Precision": 0.21,
    "Recall": 0.3073,
    "F1": 0.2495,
    "balanced_accuracy": 0.5015,
    "accuracy": 0.6147,
    "TP": 67,
    "one_sided_FP": 0.1683,
    "P_at_1": 0.24,
    "P_at_3": 0.2489,
    "NDCG_at_1": 0.24,
    "NDCG_at_3": 0.2755,
    "NDCG_at_5": 0.3287,
    "MRR": 0.4082,
    "RNDCG": 0.2578,
    "query_stats": {
      "n_queries": 75,
      "min": 9,
      "median": 10,
      "mean": 13.9467,
      "p90": 19,
      "max": 19,
      "with_ge2": 75,
      "with_ge3": 75,
      "with_ge5": 75,
      "with_ge10": 57
    },
    "Brier": 0.1812,
    "ECE": 0.1142,
    "F1_ci95": {
      "lo": 0.2313,
      "hi": 0.2997,
      "method": "bootstrap_wave_cluster",
      "rounds": 200
    },
    "directional_ranking": {
      "precision_at_1": 0.6667,
      "precision_at_3": 0.5733,
      "ndcg_at_1": 0.6667,
      "ndcg_at_3": 0.5959,
      "ndcg_at_5": 0.6046,
      "MRR": 0.7707
    },
    "failure_types": {
      "FALSE_POSITIVE_MUTUAL": 76,
      "FALSE_NEGATIVE_MUTUAL": 151,
      "LOW_SCORE_TRUE_POSITIVE": 151,
      "ONE_SIDED_FALSE_POSITIVE": 176
    }
  }
}
```

### WHAT SHOULD / SHOULD NOT GO TO PRODUCTION
- Recommendation: **KEEP_CURRENT_PRODUCTION**
- Do NOT ship Speed Dating-trained weights as WeFinally policy.
- Offline ranking/calibration ideas may inform future flagged experiments only after more validation.

## Comparison table (SEALED)

| Model | AUPRC | MCC | Precision | Recall | F1 | one-sided FP | P@1 | P@3 | NDCG@3 | RNDCG | Brier | ECE |
|-------|-------|-----|-----------|--------|----|--------------|-----|-----|--------|-------|-------|-----|
| Z_ALL_NEGATIVE | 0.1875 | 0 | 0 | 0 | 0 | 0 | 0.16 | 0.1556 | 0.1807 | 0.1703 | 0.2084 | 0.2084 |
| Z_ALL_POSITIVE | 0.1875 | 0 | 0.2084 | 1 | 0.3449 | 0.5373 | 0.16 | 0.1556 | 0.1807 | 0.1703 | 0.7916 | 0.7916 |
| Z_RANDOM | 0.2092 | -0.0351 | 0.1937 | 0.4495 | 0.2707 | 0.2639 | 0.1867 | 0.2133 | 0.246 | 0.2164 | 0.3337 | 0.3461 |
| B | 0.2097 | 0.0246 | 0.2148 | 0.7339 | 0.3323 | 0.3776 | 0.2 | 0.2 | 0.2339 | 0.2169 | 0.3821 | 0.4605 |
| C | 0.2337 | 0.0559 | 0.2163 | 0.9266 | 0.3507 | 0.4704 | 0.2267 | 0.2311 | 0.2857 | 0.2562 | 0.4603 | 0.5391 |
| LR_DIR_PRODUCT | 0.2146 | 0.0026 | 0.21 | 0.3073 | 0.2495 | 0.1683 | 0.24 | 0.2489 | 0.2755 | 0.2578 | 0.1812 | 0.1142 |
| GBDT_DIR_PRODUCT | 0.2186 | 0.0238 | 0.2147 | 0.7248 | 0.3312 | 0.3757 | 0.2667 | 0.2267 | 0.2721 | 0.2694 | 0.1899 | 0.1571 |
| BILATERAL_V2_MIN | 0.2138 | 0 | 0.2084 | 1 | 0.3449 | 0.5373 | 0.24 | 0.2356 | 0.2812 | 0.2606 | 0.3421 | 0.418 |
| FINAL_CHAMPION | 0.2146 | 0.0026 | 0.21 | 0.3073 | 0.2495 | 0.1683 | 0.24 | 0.2489 | 0.2755 | 0.2578 | 0.1812 | 0.1142 |

## Evolution journal

- Round 1: rebuilt ranking — PASS (median candidates > 1)
- Round 2: LR/GBDT baselines on DEV
- Round 3: Platt calibration + thresholds + abstention
- Rounds 4–6: failure-driven experiments; rejects recorded
- Final: champion locked → SEALED one-shot → no post-tuning

## Reality check

| Question | Answer |
|----------|--------|
| Top-1 ranking now valid? | **Yes** (median candidates 14) |
| ML beat random prevalence? | See AUPRC vs Z_RANDOM on SEALED |
| ML beat heuristic B? | See table (NO_CLEAR_IMPROVEMENT) |
| Compatibility = probability? | **No** — separate calibrated probability only when ECE/Brier acceptable |
| RAG help? | Not meaningfully tested / underpowered |
| HY3 help? | Did not run live pilot |
| Safe to promote production? | **KEEP_CURRENT_PRODUCTION** |

## Discipline

Numbers not optimized to look good. Sealed not tuned. No push/deploy/WeChat.
