# Ranking Tie Audit v1.5

## Bug

`scoreMatch.js` sorted candidates by `b.score - a.score` only. Equal scores kept **input row order**, so P@1 / P@3 / NDCG / MRR / RNDCG depended on CSV order — not model skill.

## Fix

Module: `server/data/wefinally/eval/rankingTieAware.js`

- Group by distinct score (descending).
- Metrics = **expectation** under uniform random permutation within each tie group.
- Binary relevance: closed-form for P@K, NDCG (discount-weighted), MRR.
- No candidate-id / case-id / random-seed tie-break pretending to be ranking skill.

## Tests

- RANKING_TIE_P1_PERMUTATION_INVARIANT
- RANKING_TIE_P3_PERMUTATION_INVARIANT
- RANKING_TIE_NDCG_PERMUTATION_INVARIANT
- RANKING_TIE_MRR_PERMUTATION_INVARIANT
- all-tied → P@1 = prevalence
- tie crossing Top-K boundary

Constant predictor ranking depends on relevance distribution, not source order.
