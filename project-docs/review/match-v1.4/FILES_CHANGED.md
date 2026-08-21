# Files Changed (v1.4)

## Evaluation code
- `server/data/wefinally/eval/binaryRankingMetrics.js` (new)
- `server/data/wefinally/eval/scoreMatch.js` (AUROC/AP fix)
- `server/data/wefinally/eval/matchReciprocalV14.js` (new)

## Models / ML
- uses existing `server/data/wefinally/ml/tabularBaselines.js` (no production coupling)

## Tests
- `server/selfcheck/match-eval-metrics-v14.js` (new)
- `server/package.json` scripts: `selfcheck:match-eval-metrics-v14`, `data:wefinally:match-v14`

## Review bundle
- `project-docs/review/match-v1.4/*`

## Docs
- this bundle only for v1.4 narrative

## Not committed
- raw Speed Dating CSV
- large prediction JSONL dumps
- unrelated user dirty files
