# Match v1.6 — Bilateral Benchmark Resolution

## Decision

**DECISION: SPEED_DATING_NATIVE_APPROVED_FOR_BENCHMARK**

Selected: **speed-dating-native-v1** (Harvard Dataverse Bhargava & Fisman CC0 replication, adapted to native iid/pid).

Status: **APPROVED_EVAL_ONLY** (rag=false, production_training=false).

## README questions

1. How many credible datasets were investigated? **8**
2. Did full native Speed Dating pass? **Yes — via Dataverse CC0 subset (not Gelman teaching CSV).**
3. Exact Speed Dating blocker if not? **N/A for selected path.** Gelman ARM / OpenML / Kaggle remain REVIEW_REQUIRED.
4. Did China Figshare data pass? **No (download).**
5. Exact blocker if not? **BLOCKED_DOWNLOAD — HTTP 403 on ndownloader.figshare.com from this environment; license itself is CC BY 4.0 (verified).**
6. Which additional datasets were audited? **sdamr, Mixmosa, LibimSeTi, Gelman ARM, OpenML mirror, Bhargava Dataverse, China Figshare.**
7. Which dataset has the cleanest license/provenance? **Bhargava Dataverse (CC0 1.0, dataset-level) and China Figshare (CC BY 4.0 metadata).**
8. Which has the best bilateral identity? **Bhargava Dataverse (native iid/pid, 0 missing reverse) and Mixmosa (stable user ids).**
9. Which has the best real candidate exposure? **China Figshare (rec=exposure) if downloaded; among acquired: Speed Dating wave encounters (median 18).**
10. Which has the strongest outcome? **China msg (stronger behavioral); among acquired: mutual yes (dec∧dec_o).**
11. Which has the best sample size? **China Figshare (~4.15M behavior triples) — not acquired; selected has 7,674 directed / 3,837 pairs.**
12. Which dataset was selected? **speed-dating-native-v1 (Bhargava Dataverse).**
13. What does its Gold label actually mean? **Mutual willingness to exchange contact within an experimental speed-dating encounter (mutual yes). Not marriage / long-term success.**
14. Does it support directional ranking? **Yes (per-iid candidate sets, median 18).**
15. Does it support true reciprocal evaluation? **Yes (both directions observed as separate rows; dec_o derived from reverse).**
16. Candidate count distribution? **min 9 / p10 10 / median 18 / mean 16.19 / p90 21 / max 22.**
17. Can a fresh sealed partition be created? **Yes — wave 21 SEALED (484 pairs), unopened for metrics.**
18. Is raw data committed to Git? **No.**
19. Is this benchmark allowed for RAG? **No.**
20. Is this benchmark allowed for production training? **No.**
21. What remains legally/technically uncertain? **Sparse pre-match feature set; engineering CC0 audit ≠ formal legal advice; China Figshare still blocked by network 403.**
22. Is v1.7 Final Model Tournament unblocked? **Yes (UNBLOCKED), with honest sparse-feature caveat.**

## Commands

```powershell
npm --prefix server run data:wefinally:benchmark-v16
npm --prefix server run selfcheck:match-benchmark-v16
```
