# FINAL_REVIEW_FIX — v1.5.2

| ID | Issue | Status |
|----|-------|--------|
| REVIEW-FINAL-01 | Predictor could access `fv.metadata.iid/pid/wave` | **FIXED** |
| REVIEW-FINAL-02 | Prediction API returned `evaluatorGold` with predictions | **FIXED** |

## REVIEW-FINAL-01

- Added `buildNativeModelInput(featureView)` → `{ features }` only.
- `predictTrueDirectionalPairs` calls `scoreFn(modelInput)`.
- Accessing `metadata` / `iid` / `pid` / `wave` / `directed_key` throws `MODEL_INPUT_IDENTITY_FORBIDDEN`.
- Orchestration still keeps metadata on full FeatureView for pairing/split/audit.

## REVIEW-FINAL-02

- Split APIs: `predictTrueDirectionalPairs` (predictions only) + `buildEvaluatorGold`.
- `buildPredictionPairInput` strips gold before predictor path.
- Full API return gold-flip SHA stable: `NATIVE_PREDICTOR_API_FULL_RETURN_GOLD_FLIP_STABLE`.

## Stop

No v1.5.3. Remaining blocker: **WAITING_NATIVE_ID_DATA**.
