# FINAL_BENCHMARK_DECISION

DECISION:
SPEED_DATING_NATIVE_APPROVED_FOR_BENCHMARK

## Why

1. Harvard Dataverse dataset `doi:10.7910/DVN/27893` carries an explicit **dataset-level CC0 1.0** license (not inherited from a paper or R package).
2. File `ReplicationData_Stata12.tab` contains native **iid / pid / wave / dec** with perfect reverse coverage (3,837 physical pairs, 0 missing reverse).
3. Candidate exposure is real wave encounters (median candidates/user = 18 > 1) — ranking-valid.
4. Minimal adapter derives `dec_o` and `match` from reverse rows and omits post-outcome `attr`, feeding the frozen v1.5.2 native pipeline without evaluator redesign.

## Why not others

| Candidate | Hard blocker / reason not selected |
|-----------|-------------------------------------|
| Gelman ARM full CSV | REVIEW_REQUIRED — public teaching host ≠ reuse license |
| OpenML / GitHub speed-dating | No iid/pid; claimed PDDL unverified for underlying data |
| CRAN sdamr | Package GPL-3 ≠ dataset; Kaggle lineage → REVIEW_REQUIRED |
| China Figshare | CC BY 4.0 clean, but BLOCKED_DOWNLOAD (HTTP 403); MANUAL_IMPORT_REQUIRED |
| Mixmosa | Best alternate schema, but GitHub `license: null` → REVIEW_REQUIRED |
| LibimSeTi | BLOCKED_COMMERCIAL (research-only / non-commercial) |

## Caveats (honest)

- Pre-match features are **sparse** (gender, order, round, date, RA). Rich questionnaire fields from the classic full Speed Dating CSV are not in this CC0 file.
- Gold = experimental mutual yes — **not** relationship success.
- Status remains **APPROVED_EVAL_ONLY**; not for RAG or production model training.
- China Figshare remains the preferred **upgrade path** once download succeeds (richer exposure/click/msg).
