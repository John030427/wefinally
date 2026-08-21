# Failure Analysis v1.5

## Ranking

Prior P@K / NDCG / MRR could change under candidate reordering with equal scores. Fixed via expected-within-tie metrics.

## Reciprocal identity

v1.4 `RECIP_*` used approximate `p_ba` from swapped feature vectors on subject-oriented OpenML rows. That is **not** P(B likes A) from B's subject record.

Fingerprint subject/partner schemas differ → **PAIR_IDENTITY_UNCERTAIN**.

## Current blockage

WAITING_NATIVE_ID_DATA prevents TRUE_CANONICAL_PAIR and true reciprocal aggregators.

When native data arrives: expect v1.4 ranking of reciprocal aggregators to change; do not preserve RECIP_LOGIT_META by construction.
