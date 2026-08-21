# Match Native Pipeline Integrity Closure v1.5.2

## Answers

1. **Can any prediction artifact contain gold?** No — recursive forbidden-key scan; `_eval_only` removed.
2. **Does full gold-flip preserve artifact SHA?** Yes — `NATIVE_FULL_ARTIFACT_GOLD_FLIP_STABLE`.
3. **Are iid/pid/wave excluded from model features?** Yes — metadata only; `MODEL_FEATURES_NO_*`.
4. **Is exact duplicate truly exact?** Yes — normalized full-row hash, not decisions alone.
5. **Are same-outcome feature conflicts quarantined?** Yes — `FEATURE_CONFLICT_DUPLICATE`, not kept.
6. **Are match/decision inconsistencies excluded?** Yes — not in valid directed / Gold.
7. **Native full data status?** **BLOCKED** — `WAITING_NATIVE_ID_DATA`
8. **True reciprocal model status?** **BLOCKED_MODEL** (no product scorer) + blocked data
9. **What remains blocked?** Auditable full native iid/pid corpus under REVIEW_REQUIRED.

## Stop rule

No further native infrastructure (no v1.5.3). Next step = obtain legal native data or switch datasets.
