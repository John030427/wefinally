# Duplicate Semantics v1.5.2

Same `wave|iid|pid`:

| Class | Rule | Action |
|-------|------|--------|
| EXACT_DUPLICATE | normalized full-row hash equal | keep one, count dropped |
| FEATURE_CONFLICT_DUPLICATE | outcomes same, features differ | quarantine all |
| OUTCOME_CONFLICT_DUPLICATE | decisions differ | quarantine all |

Never silent Map overwrite.
