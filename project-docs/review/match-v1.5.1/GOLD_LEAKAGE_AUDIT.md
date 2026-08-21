# Gold Leakage Audit v1.5.1

## Finding

v1.5 `trueReciprocalV15.js` used `row.a_decision ? 0.75 : 0.25` as scores — **gold leakage**.

## Fix

- Predictions only via `buildNativeDirectionalFeatureView` + label-blind `scoreFn`.
- Missing scoreFn → `TRUE_RECIPROCAL_MODEL_NOT_READY` (no fake metrics).
- Gold flip test: identical prediction bytes when evaluator-only decisions flip.
- Tests: `NO_GOLD_DERIVED_NATIVE_PREDICTION`, `NATIVE_GOLD_FLIP_PREDICTION_STABILITY`.
