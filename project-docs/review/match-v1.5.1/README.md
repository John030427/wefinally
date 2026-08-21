# Match Native Pipeline Hardening v1.5.1

## Status summary

| Gate | Result |
|------|--------|
| native full dataset | **BLOCKED** (`WAITING_NATIVE_ID_DATA`) |
| native pipeline (code) | **READY** for integrity (synthetic + gates) |
| gold leakage | **PASS** |
| CSV parser | **PASS** (`csv-parse`) |
| duplicate handling | **PASS** |
| true reciprocal model | **BLOCKED_DATA** (+ **BLOCKED_MODEL** until directional scorer wired) |

## Answers

1. Gold-derived placeholder scores removed from `trueReciprocalV15.js`.
2. Schema headers alone no longer set `TRUE_RECIPROCAL_AVAILABLE`.
3. CSV uses `csv-parse` (quoted commas, escaped quotes, BOM, empty fields).
4. Duplicate `wave|iid|pid` → EXACT_DUPLICATE / CONFLICTING_DUPLICATE (no silent Map overwrite).
5. Full native iid/pid corpus still **WAITING** under REVIEW_REQUIRED — no ungated download.
6. Synthetic fixture validates the pipeline without product accuracy claims.
