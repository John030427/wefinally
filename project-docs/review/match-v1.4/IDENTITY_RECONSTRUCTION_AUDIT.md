# Identity Reconstruction Audit

```json
{
  "identity_mode": "IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT",
  "raw_rows": 8378,
  "unique_subject_fingerprints": 549,
  "directed_encounters": 8378,
  "canonical_pairs": 8306,
  "quarantined": 32,
  "query_stats": {
    "n_queries": 549,
    "min": 5,
    "p10": 8,
    "median": 16,
    "mean": 15.188,
    "p90": 21,
    "max": 22,
    "with_ge2": 549,
    "with_ge3": 549,
    "with_ge5": 549,
    "with_ge10": 462
  },
  "rows_per_participant_wave": {
    "min": 5,
    "median": 16,
    "max": 22
  },
  "fingerprint_fields_subject": [
    "wave",
    "gender",
    "age",
    "attractive_important",
    "sincere_important",
    "intellicence_important",
    "funny_important",
    "ambtition_important",
    "shared_interests_important",
    "sports…yoga hobbies"
  ],
  "fingerprint_fields_partner": [
    "wave",
    "age_o",
    "pref_o_*"
  ],
  "forbidden_in_fingerprint": [
    "decision",
    "decision_o",
    "match",
    "like",
    "*_partner",
    "*_o attractiveness ratings"
  ],
  "status": "PASS_WITH_UNCERTAINTY",
  "note": "IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT — OpenML CSV lacks native iid/pid"
}
```

Status: **IDENTITY_RECONSTRUCTION_UNCERTAIN** (fingerprint proxy; no native iid/pid).
Ranking candidates are multi-partner under this proxy; collisions possible if two people share age/gender/prefs/hobbies in a wave.
