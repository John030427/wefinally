# TRACK_A_DIRECTIONAL

DEV directional metrics:

```json
{
  "Z_RANDOM": {
    "n": 450,
    "prevalence": 0.4622,
    "AVERAGE_PRECISION": 0.4661,
    "AUROC": 0.5043,
    "MCC": 0.0584,
    "Precision": 0.493,
    "Recall": 0.5048,
    "F1": 0.4988,
    "Brier": 0.3305,
    "ECE": 0.2375,
    "tp": 105,
    "fp": 108,
    "tn": 134,
    "fn": 103,
    "ranking": {
      "P_at_1": 0.4,
      "P_at_3": 0.4222,
      "NDCG_at_3": 0.4129,
      "MRR": 0.5722
    }
  },
  "RULE_SIMPLE": {
    "n": 450,
    "prevalence": 0.4622,
    "AVERAGE_PRECISION": 0.5412,
    "AUROC": 0.6132,
    "MCC": 0.1624,
    "Precision": 0.5762,
    "Recall": 0.4183,
    "F1": 0.4847,
    "Brier": 0.2401,
    "ECE": 0.0377,
    "tp": 87,
    "fp": 64,
    "tn": 178,
    "fn": 121,
    "ranking": {
      "P_at_1": 0.6,
      "P_at_3": 0.5333,
      "NDCG_at_3": 0.5598,
      "MRR": 0.7189
    }
  },
  "LR_DIRECTIONAL": {
    "n": 450,
    "prevalence": 0.4622,
    "AVERAGE_PRECISION": 0.5628,
    "AUROC": 0.6552,
    "MCC": 0.1868,
    "Precision": 0.5864,
    "Recall": 0.4567,
    "F1": 0.5135,
    "Brier": 0.2334,
    "ECE": 0.0748,
    "tp": 95,
    "fp": 67,
    "tn": 175,
    "fn": 113,
    "ranking": {
      "P_at_1": 0.6,
      "P_at_3": 0.6889,
      "NDCG_at_3": 0.6763,
      "MRR": 0.7333
    }
  },
  "GBDT_DIRECTIONAL": {
    "n": 450,
    "prevalence": 0.4622,
    "AVERAGE_PRECISION": 0.5446,
    "AUROC": 0.6243,
    "MCC": 0.2529,
    "Precision": 0.6167,
    "Recall": 0.5337,
    "F1": 0.5722,
    "Brier": 0.2428,
    "ECE": 0.0811,
    "tp": 111,
    "fp": 69,
    "tn": 173,
    "fn": 97,
    "ranking": {
      "P_at_1": 0.6333,
      "P_at_3": 0.6333,
      "NDCG_at_3": 0.6436,
      "MRR": 0.7537
    }
  }
}
```

Best directional on DEV: **LR_DIRECTIONAL** (AP 0.5628) vs RULE_SIMPLE (0.5412).
