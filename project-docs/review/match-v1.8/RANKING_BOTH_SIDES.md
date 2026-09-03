# RANKING_BOTH_SIDES

```json
{
  "champion_unchanged": true,
  "structured_status_unchanged": "STRUCTURED_SMALL_UNCERTAIN_IMPROVEMENT",
  "pair_level_ap_auroc_unchanged": true,
  "old_dev_ranking_queries": 15,
  "note_old_ranking": "v1.7 rankingMetrics grouped only by row_ab.iid (canonical orientation) — one-sided",
  "DEV": {
    "split": "DEV",
    "n_pairs": 225,
    "unique_participants": 30,
    "pair_level": {
      "AVERAGE_PRECISION": 0.2804,
      "AUROC": 0.656
    },
    "ranking_legacy_one_sided": {
      "n_queries": 15,
      "P_at_1": 0.2,
      "P_at_3": 0.2444,
      "NDCG_at_3": 0.2564,
      "NDCG_at_5": 0.283,
      "MRR": 0.4024
    },
    "ranking_both_sides": {
      "n_queries": 30,
      "P_at_1": 0.1667,
      "P_at_3": 0.2667,
      "NDCG_at_3": 0.2927,
      "NDCG_at_5": 0.3035,
      "MRR": 0.4035
    },
    "directional_both_sides": {
      "n_queries": 30,
      "P_at_1": 0.5667,
      "P_at_3": 0.6444,
      "NDCG_at_3": 0.6365,
      "NDCG_at_5": 0.5859,
      "MRR": 0.72
    },
    "orientation_invariant": true,
    "query_count_equals_unique_participants": true
  },
  "LOCKED_RETROSPECTIVE_TEST": {
    "split": "LOCKED_RETROSPECTIVE_TEST",
    "n_pairs": 484,
    "unique_participants": 44,
    "pair_level": {
      "AVERAGE_PRECISION": 0.23,
      "AUROC": 0.6506
    },
    "ranking_legacy_one_sided": {
      "n_queries": 22,
      "P_at_1": 0.0909,
      "P_at_3": 0.1818,
      "NDCG_at_3": 0.1665,
      "NDCG_at_5": 0.1799,
      "MRR": 0.2481
    },
    "ranking_both_sides": {
      "n_queries": 44,
      "P_at_1": 0.0682,
      "P_at_3": 0.1894,
      "NDCG_at_3": 0.1802,
      "NDCG_at_5": 0.226,
      "MRR": 0.2899
    },
    "directional_both_sides": {
      "n_queries": 44,
      "P_at_1": 0.3636,
      "P_at_3": 0.4924,
      "NDCG_at_3": 0.4805,
      "NDCG_at_5": 0.4978,
      "MRR": 0.5953
    },
    "orientation_invariant": true,
    "query_count_equals_unique_participants": true
  },
  "bootstrap_wave_dev": "DEGENERATE_SINGLE_CLUSTER",
  "generated_at": "2026-08-21T10:01:45.965Z"
}
```
