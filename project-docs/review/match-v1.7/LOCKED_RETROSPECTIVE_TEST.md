# LOCKED_RETROSPECTIVE_TEST

**NOT FRESH SEALED.** Wave 21 evaluated once after champion lock. No post-hoc tuning.

Status: **REGRESSION**

```json
{
  "label": "LOCKED_RETROSPECTIVE_TEST",
  "NOT_FRESH_SEALED": true,
  "wave": "21",
  "n_pairs": 484,
  "champion": {
    "n": 484,
    "prevalence": 0.1488,
    "AVERAGE_PRECISION": 0.23,
    "AUROC": 0.6506,
    "MCC": 0,
    "Precision": 0,
    "Recall": 0,
    "F1": 0,
    "Brier": 0.144,
    "ECE": 0.1346,
    "tp": 0,
    "fp": 0,
    "tn": 412,
    "fn": 72,
    "ranking": {
      "n_queries": 22,
      "P_at_1": 0.0909,
      "P_at_3": 0.1818,
      "NDCG_at_3": 0.1665,
      "NDCG_at_5": 0.1799,
      "MRR": 0.2481
    },
    "four_state": {
      "YY": {
        "n": 72,
        "mean": 0.2862,
        "p90": 0.2934,
        "high_conf_rate": 0
      },
      "YN": {
        "n": 122,
        "mean": 0.2813,
        "p90": 0.2886,
        "high_conf_rate": 0
      },
      "NY": {
        "n": 92,
        "mean": 0.2841,
        "p90": 0.2912,
        "high_conf_rate": 0
      },
      "NN": {
        "n": 198,
        "mean": 0.2833,
        "p90": 0.2924,
        "high_conf_rate": 0
      },
      "one_sided_high_conf_rate": 0
    },
    "high_conf_n": 0,
    "high_conf_one_sided_or_false_rate": null
  },
  "rule_simple": {
    "n": 484,
    "prevalence": 0.1488,
    "AVERAGE_PRECISION": 0.2593,
    "AUROC": 0.662,
    "MCC": 0,
    "Precision": 0,
    "Recall": 0,
    "F1": 0,
    "Brier": 0.1418,
    "ECE": 0.1268,
    "tp": 0,
    "fp": 0,
    "tn": 412,
    "fn": 72,
    "ranking": {
      "n_queries": 22,
      "P_at_1": 0.3182,
      "P_at_3": 0.197,
      "NDCG_at_3": 0.2348,
      "NDCG_at_5": 0.2339,
      "MRR": 0.4002
    },
    "four_state": {
      "YY": {
        "n": 72,
        "mean": 0.2788,
        "p90": 0.2884,
        "high_conf_rate": 0
      },
      "YN": {
        "n": 122,
        "mean": 0.2728,
        "p90": 0.2804,
        "high_conf_rate": 0
      },
      "NY": {
        "n": 92,
        "mean": 0.2771,
        "p90": 0.2851,
        "high_conf_rate": 0
      },
      "NN": {
        "n": 198,
        "mean": 0.2754,
        "p90": 0.2839,
        "high_conf_rate": 0
      },
      "one_sided_high_conf_rate": 0
    },
    "high_conf_n": 0,
    "high_conf_one_sided_or_false_rate": null
  },
  "z_random": {
    "n": 484,
    "prevalence": 0.1488,
    "AVERAGE_PRECISION": 0.1973,
    "AUROC": 0.5358,
    "MCC": 0.034,
    "Precision": 0.1694,
    "Recall": 0.2917,
    "F1": 0.2143,
    "Brier": 0.2061,
    "ECE": 0.2216,
    "tp": 21,
    "fp": 103,
    "tn": 309,
    "fn": 51,
    "ranking": {
      "n_queries": 22,
      "P_at_1": 0.2727,
      "P_at_3": 0.197,
      "NDCG_at_3": 0.2225,
      "NDCG_at_5": 0.193,
      "MRR": 0.3769
    },
    "four_state": {
      "YY": {
        "n": 72,
        "mean": 0.3664,
        "p90": 0.7516,
        "high_conf_rate": 0.125
      },
      "YN": {
        "n": 122,
        "mean": 0.3302,
        "p90": 0.665,
        "high_conf_rate": 0.0738
      },
      "NY": {
        "n": 92,
        "mean": 0.3629,
        "p90": 0.6488,
        "high_conf_rate": 0.0761
      },
      "NN": {
        "n": 198,
        "mean": 0.3134,
        "p90": 0.6242,
        "high_conf_rate": 0.0758
      },
      "one_sided_high_conf_rate": 0.0748
    },
    "high_conf_n": 40,
    "high_conf_one_sided_or_false_rate": 0.775
  }
}
```

Champion AP 0.23 vs rule 0.2593.
