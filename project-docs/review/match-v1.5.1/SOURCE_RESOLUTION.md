# Source Resolution v1.5.1

## Full native iid/pid corpus: WAITING_NATIVE_ID_DATA

| Candidate | iid/pid | License note | Action |
|-----------|---------|--------------|--------|
| Columbia / Gelman ARM examples (`stat.columbia.edu/~gelman/arm/examples/speed.dating/`) | Likely yes | Public teaching materials ≠ automatic reusable dataset license | Document only; **REVIEW_REQUIRED** |
| CRAN **sdamr** (waves 6–9, 1562 rows; has iid/pid) | Yes (subset) | Package GPL-3 but docs cite **Kaggle** as source | `NATIVE_ID_SMOKE_CANDIDATE` + **REVIEW_REQUIRED** — **not ingested** (would bypass existing gate) |
| **peopleanalyticsdata** | iid only, **no pid** | — | Does **not** solve true reciprocal |
| OpenML sandbox CSV (on disk) | No iid/pid | REVIEW_REQUIRED / rag=false | Fingerprint only |

No download performed this round. Status remains **WAITING_NATIVE_ID_DATA**.
