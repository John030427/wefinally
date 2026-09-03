# Files Changed (v1.4 + review-fix)

## Evaluation
- `server/data/wefinally/eval/binaryRankingMetrics.js` — distinct-threshold AP/PR
- `server/data/wefinally/eval/scoreMatch.js` — uses fixed metrics
- `server/data/wefinally/eval/matchReciprocalV14.js` — calibration provenance; loadPart sealedAccess
- `server/data/wefinally/eval/overnightEvolution.js` — sealed evaluator-only load

## Builders / importers
- `server/data/wefinally/builders/splitSpeedDatingV13.js` — no sealed encounters.jsonl
- `server/data/wefinally/builders/sealedAccess.js` — fail-closed sealed loaders
- `server/data/wefinally/importers/nativeIdMigration.js` — NATIVE_ID_DATASET_PREFERRED path

## Tests
- `server/selfcheck/match-eval-metrics-v14.js`
- `server/selfcheck/match-eval-review-fix-v14.js`
- `server/package.json` scripts

## Review bundle
- `project-docs/review/match-v1.4/*` including REVIEW_FIXES.md
