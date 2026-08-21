# Prediction / Gold Separation v1.5.2

`trueDirectionalScores` returns:

```json
{ "predictions": [{ "canonical_key", "p_ab", "p_ba", "score" }], "evaluatorGold": [...] }
```

`evalBinary(predictions, evaluatorGold)` joins by `canonical_key` only after predictions are finalized.

Recursive `assertNoGoldInPrediction` throws `NO_GOLD_IN_PREDICTION_ARTIFACT` on any nested forbidden key.
