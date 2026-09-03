# ROUND_00 — Baseline (v1.2 reality)

**Run:** `match-evo-2026-08-21-overnight`  
**Git HEAD:** `f0d9c7d4161ef1a6b25d14b825f74948defaf106` (= origin)  
**Integrity:** `INTEGRITY_PASS_FIXTURE_PROXY`

## What we started with

- Speed Dating REAL_EXTERNAL_DATA: 8378 GOLD_OBSERVED rows (OpenML/GitHub mirror; no `iid`/`pid`)
- Frozen Gold v1.2: n=1154, mutual positives=188, prevalence≈0.1629
- Negative controls sensible (ALL_NEG acc≈0.837, TP=0)
- Fixture A–E AUPRC≈0.18–0.19 (weak, label-blind after v1.2)

## What was wrong for ranking

- Person ids = per-row `w{wave}_subj_{idx}` → every ranking query had **1 candidate**
- P@K / NDCG = `NOT_APPLICABLE`
- Prefs/interests not mapped into cleaned FeatureView
- Current Frozen Gold repeatedly inspected → retired as **AUDIT_TEST_V1_2** (keep, do not optimize against)

## Goal this overnight

Rebuild real multi-candidate ranking + sealed holdout + ML/calibration evolution on DEV only; SEALED once at end.
