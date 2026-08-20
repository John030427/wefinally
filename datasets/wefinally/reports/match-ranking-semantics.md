# Match Ranking Semantics (v1.3 overnight)

Query key = `iid :: wave` (directed subject).  
Candidates = all partners actually encountered by that subject in the wave.

## Global reconstruction stats

```json
{
  "n_queries": 549,
  "min": 5,
  "median": 16,
  "mean": 15.188,
  "p90": 21,
  "max": 22,
  "with_ge2": 549,
  "with_ge3": 549,
  "with_ge5": 549,
  "with_ge10": 462
}
```

Identity mode: `IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT` (OpenML CSV lacked native iid/pid).

## DEV (overnight run)

Median candidates ≈ 14; with_ge2 = all queries — Precision@K / NDCG / MRR are **applicable**.

v1.2 AUDIT_TEST frozen-gold remains size-1 under old ids — retained for regression only.
