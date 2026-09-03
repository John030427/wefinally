# TRACK_A_RECIPROCAL

Champion (DEV): **LR_DIRECTIONAL+RECIP_PRODUCT+Platt**

vs RULE_SIMPLE+RECIP_MIN delta AP: 0.0696

Status: **STRUCTURED_SMALL_UNCERTAIN_IMPROVEMENT**

Single-wave DEV bootstrap is degenerate — do not treat as CLEAR.

```json
[
  {
    "directional_model": "RULE_SIMPLE",
    "aggregator": "RECIP_MIN",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2108,
      "AUROC": 0.5794,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1495,
      "ECE": 0.112,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2667,
        "P_at_3": 0.2,
        "NDCG_at_3": 0.2524,
        "NDCG_at_5": 0.2837,
        "MRR": 0.4067
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2778,
          "p90": 0.2851,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2779,
          "p90": 0.2858,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2749,
          "p90": 0.2814,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2768,
          "p90": 0.2849,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "RULE_SIMPLE",
    "aggregator": "RECIP_PRODUCT",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2091,
      "AUROC": 0.5812,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1501,
      "ECE": 0.1152,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2,
        "P_at_3": 0.1778,
        "NDCG_at_3": 0.2075,
        "NDCG_at_5": 0.2524,
        "MRR": 0.3567
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2815,
          "p90": 0.2912,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2818,
          "p90": 0.2932,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2776,
          "p90": 0.2868,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2797,
          "p90": 0.2936,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "RULE_SIMPLE",
    "aggregator": "RECIP_GEOMEAN",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2091,
      "AUROC": 0.5812,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.149,
      "ECE": 0.1094,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2,
        "P_at_3": 0.1778,
        "NDCG_at_3": 0.2075,
        "NDCG_at_5": 0.2524,
        "MRR": 0.3567
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.275,
          "p90": 0.2806,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2751,
          "p90": 0.2816,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2726,
          "p90": 0.2782,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2737,
          "p90": 0.2818,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "RULE_SIMPLE",
    "aggregator": "RECIP_HARMONIC",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2096,
      "AUROC": 0.5804,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.149,
      "ECE": 0.1096,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.1333,
        "P_at_3": 0.1778,
        "NDCG_at_3": 0.1925,
        "NDCG_at_5": 0.2391,
        "MRR": 0.3267
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2752,
          "p90": 0.281,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2753,
          "p90": 0.282,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2728,
          "p90": 0.2785,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.274,
          "p90": 0.2822,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "RULE_SIMPLE",
    "aggregator": "RECIP_ASYMMETRY_PENALTY",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2122,
      "AUROC": 0.5748,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1501,
      "ECE": 0.1145,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2667,
        "P_at_3": 0.1778,
        "NDCG_at_3": 0.232,
        "NDCG_at_5": 0.3036,
        "MRR": 0.3998
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2804,
          "p90": 0.2888,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2804,
          "p90": 0.2898,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.277,
          "p90": 0.2856,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2797,
          "p90": 0.2886,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "LR_DIRECTIONAL",
    "aggregator": "RECIP_MIN",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2233,
      "AUROC": 0.6265,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1496,
      "ECE": 0.1127,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2,
        "P_at_3": 0.2444,
        "NDCG_at_3": 0.251,
        "NDCG_at_5": 0.2798,
        "MRR": 0.3897
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2786,
          "p90": 0.2841,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2796,
          "p90": 0.2839,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2749,
          "p90": 0.2795,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2774,
          "p90": 0.2834,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "LR_DIRECTIONAL",
    "aggregator": "RECIP_PRODUCT",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2804,
      "AUROC": 0.656,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1504,
      "ECE": 0.1172,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2,
        "P_at_3": 0.2444,
        "NDCG_at_3": 0.2564,
        "NDCG_at_5": 0.283,
        "MRR": 0.4024
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.284,
          "p90": 0.2899,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2835,
          "p90": 0.2894,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2798,
          "p90": 0.285,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2813,
          "p90": 0.2884,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "LR_DIRECTIONAL",
    "aggregator": "RECIP_GEOMEAN",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2804,
      "AUROC": 0.656,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1494,
      "ECE": 0.1116,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2,
        "P_at_3": 0.2444,
        "NDCG_at_3": 0.2564,
        "NDCG_at_5": 0.283,
        "MRR": 0.4024
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2775,
          "p90": 0.2809,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2772,
          "p90": 0.2807,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2749,
          "p90": 0.2782,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2758,
          "p90": 0.2801,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "LR_DIRECTIONAL",
    "aggregator": "RECIP_HARMONIC",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2781,
      "AUROC": 0.6589,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1494,
      "ECE": 0.1116,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2,
        "P_at_3": 0.2444,
        "NDCG_at_3": 0.251,
        "NDCG_at_5": 0.2787,
        "MRR": 0.3912
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2776,
          "p90": 0.2811,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2774,
          "p90": 0.2811,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2748,
          "p90": 0.278,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.276,
          "p90": 0.2801,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "LR_DIRECTIONAL",
    "aggregator": "RECIP_ASYMMETRY_PENALTY",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.196,
      "AUROC": 0.5817,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1498,
      "ECE": 0.1131,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2667,
        "P_at_3": 0.2444,
        "NDCG_at_3": 0.2715,
        "NDCG_at_5": 0.2844,
        "MRR": 0.4341
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2789,
          "p90": 0.2865,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2812,
          "p90": 0.2879,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2744,
          "p90": 0.2813,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2783,
          "p90": 0.2863,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "GBDT_DIRECTIONAL",
    "aggregator": "RECIP_MIN",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2045,
      "AUROC": 0.5766,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1492,
      "ECE": 0.1105,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.22,
        "P_at_3": 0.22,
        "NDCG_at_3": 0.2359,
        "NDCG_at_5": 0.2701,
        "MRR": 0.376
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2762,
          "p90": 0.2832,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2756,
          "p90": 0.2832,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.274,
          "p90": 0.2736,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.275,
          "p90": 0.2832,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  },
  {
    "directional_model": "GBDT_DIRECTIONAL",
    "aggregator": "RECIP_PRODUCT",
    "calibrated": {
      "n": 225,
      "prevalence": 0.1644,
      "AVERAGE_PRECISION": 0.2206,
      "AUROC": 0.6151,
      "MCC": 0,
      "Precision": 0,
      "Recall": 0,
      "F1": 0,
      "Brier": 0.1507,
      "ECE": 0.1184,
      "tp": 0,
      "fp": 0,
      "tn": 188,
      "fn": 37,
      "ranking": {
        "n_queries": 15,
        "P_at_1": 0.2333,
        "P_at_3": 0.2333,
        "NDCG_at_3": 0.2487,
        "NDCG_at_5": 0.2846,
        "MRR": 0.4005
      },
      "four_state": {
        "YY": {
          "n": 37,
          "mean": 0.2851,
          "p90": 0.2941,
          "high_conf_rate": 0
        },
        "YN": {
          "n": 48,
          "mean": 0.2844,
          "p90": 0.2941,
          "high_conf_rate": 0
        },
        "NY": {
          "n": 86,
          "mean": 0.2815,
          "p90": 0.2841,
          "high_conf_rate": 0
        },
        "NN": {
          "n": 54,
          "mean": 0.2819,
          "p90": 0.2941,
          "high_conf_rate": 0
        },
        "one_sided_high_conf_rate": 0
      },
      "high_conf_n": 0,
      "high_conf_one_sided_or_false_rate": null
    },
    "abstention_balanced": {
      "threshold": 0.5,
      "coverage": 0,
      "recommendation_rate": 0,
      "no_match_rate": 1,
      "mutual_hit_among_recommended": null,
      "one_sided_false_recommendation": null,
      "mutual_pairs_recovered": 0,
      "n_recommended": 0
    }
  }
]
```
