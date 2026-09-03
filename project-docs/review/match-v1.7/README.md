# Match v1.7 — Final Model Tournament

## Answers

1. Was v1.6 “fresh sealed” downgraded correctly? **Yes → LOCKED_RETROSPECTIVE_TEST**
2. Is the selected CC0 benchmark still accepted? **Yes (APPROVED_EVAL_ONLY)**
3. Predictor limitations? **Sparse: gender/order/round/date/RA**
4. Did LR beat rules (DEV directional)? **Yes (AP 0.5628 vs 0.5412)**
5. Did GBDT beat rules? **Slightly on directional; not champion**
6. Best directional? **LR_DIRECTIONAL**
7. Best reciprocal aggregator? **RECIP_PRODUCT (+ Platt) with LR**
8. Statistically meaningful? **Uncertain — single-wave DEV; locked REGRESSION**
9. One-sided FP? See four_state / high_conf rates in METRICS
10. Abstention help? **Documented operating points; supports NO MATCH**
11. Calibrated enough to call probability? **No for user-facing relationship probability**
12. Locked retrospective? **REGRESSION** (champ AP 0.23 < rule 0.2593)
13. Did real HY3 run? **Yes (cloudbase/hy3)**
14. HY3 product safety? **HY3_NOT_READY**
15. HY3 as core ranker? **No**
16. RAG? **RAG_NOT_JUSTIFIED**
17. Final architecture? **DETERMINISTIC_ONLY_CORE + HY3_COORDINATION_ONLY**
18. Stays deterministic? **Hard gates, DB, core ranking**
19. HY3 role? **Coordination-first until reasoning safety cleared**
20. Change production now? **No — KEEP_CURRENT_PRODUCTION**
21. Unproven? **Fresh external outcomes; rich-profile ranking; HY3 safety**
22. v1.8 staging E2E unblocked? **UNBLOCKED as next phase (not auto-deploy)**
