# V17_RANKING_CORRECTION

## Bug

v1.7 `rankingMetrics()` grouped only by `p.row_ab.iid` (canonical orientation).
Each physical pair entered **one** participant query — one-sided.

## Fix

Reciprocal score S(A,B) enters query A and query B.
Directional p_ab / p_ba enter true subject queries.

## Numbers

| Split | Legacy one-sided n_queries | Both-sides n_queries | Unique participants |
|-------|----------------------------|----------------------|---------------------|
| DEV | 15 | 30 | 30 |
| LOCKED | 22 | 44 | 44 |

Pair-level AP/AUROC: **unchanged** (true).

Structured conclusion: **UNCHANGED** (STRUCTURED_SMALL_UNCERTAIN_IMPROVEMENT).

Wave bootstrap on single-wave DEV remains **DEGENERATE_SINGLE_CLUSTER**.
