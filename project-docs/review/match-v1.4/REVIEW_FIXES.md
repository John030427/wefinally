# REVIEW_FIXES — v1.4 external review

| ID | Issue | Status |
|----|-------|--------|
| REVIEW-01 | AP mixed-tie order dependence (not sklearn semantics) | **FIXED** |
| REVIEW-02 | Platt calibrated PRODUCT but named `${bestRecip}_PLATT` | **FIXED** |
| REVIEW-03 | SEALED_TEST wrote gold-bearing `encounters.jsonl` | **FIXED** |
| REVIEW-04 | Identity fingerprint weak collision check (`length>50`) | **FIXED** (audit hardened; status remains UNCERTAIN) |
| REVIEW-05 | RUN_MANIFEST.final_commit lagged HEAD (`f34501c` vs `66cbe21`) | **FIXED** (this commit sets final_commit = HEAD after push) |

## REVIEW-01

`averagePrecision` now aggregates by **distinct score thresholds**. Within a tie group only `(n_pos, n_neg)` matter.  
Tests: `MIXED_TIE_AP_PERMUTATION_INVARIANT`, `MIXED_TIE_AP_SKLEARN_MATCH`.  
`PR_AUC_TRAPEZOID` also distinct-threshold / tie-invariant.

## REVIEW-02

`scoreFns[bestRecip]` used for both CAL fit and DEV apply. Artifact records `base_model`, `base_score_artifact_sha256`, `calibrator`, `calibration_split`, `calibrated_model_name`.

## REVIEW-03

`splitSpeedDatingV13` writes only `features.jsonl` + `gold.jsonl` + `metadata.json` under SEALED_TEST; deletes legacy encounters.  
`loadPart('SEALED_TEST')` throws `SEALED_GENERAL_LOADER_FORBIDDEN`.  
Evaluator-only: `loadSealedForEvaluatorOnly({ explicit: true })`.

## REVIEW-04

Identity audit reports multiplicity distribution, ambiguous subjects, collision candidates. Status: **IDENTITY_RECONSTRUCTION_UNCERTAIN**.  
Native path: `nativeIdMigration.js` / `NATIVE_ID_DATASET_PREFERRED` (no ungated download).

## REVIEW-05

Explanation: first v1.4 commit was `f34501c`; a follow-up docs commit `66cbe21` updated RUN_MANIFEST to still point at `f34501c` (stale). Local and remote HEAD were both `66cbe21` after push, but manifest field lagged. This review-fix aligns all three.
