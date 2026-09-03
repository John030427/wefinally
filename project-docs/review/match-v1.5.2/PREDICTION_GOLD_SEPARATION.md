# Prediction / Gold Separation v1.5.2 (+ final fix)

## Predictor

`predictTrueDirectionalPairs(predictionPairInputs, scoreFn)` → `{ status, predictions }` **only**.

Never constructs `evaluatorGold`.

## Evaluator

`buildEvaluatorGold(completePairs)` — separate function.

`evalBinary(predictions, evaluatorGold)` joins by `canonical_key`.

## Strip before predict

`buildPredictionPairInput` removes decisions/match from rows before scoring.
