# Identity Reconstruction Audit

```json
{
  "identity_mode": "IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT",
  "status": "IDENTITY_RECONSTRUCTION_UNCERTAIN",
  "raw_rows": 8378,
  "unique_subject_fingerprints": 549,
  "unique_partner_fingerprints": 550,
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
  "fingerprint_multiplicity": {
    "min": 5,
    "p50": 16,
    "p90": 21,
    "max": 22
  },
  "rows_per_participant_wave": {
    "min": 5,
    "median": 16,
    "max": 22
  },
  "ambiguous_subject_fingerprints": [],
  "ambiguous_subject_count": 0,
  "collision_candidates": 0,
  "fingerprint_fields_subject": [
    "wave",
    "gender",
    "age",
    "*_important prefs",
    "hobby self-ratings"
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
    "*_o ratings"
  ],
  "note": "Fingerprint is participant-invariant PRE_MATCH only; not native iid/pid. Prefer NATIVE_ID_DATASET when available."
}
```

Status: **IDENTITY_RECONSTRUCTION_UNCERTAIN** (fingerprint proxy; no native iid/pid).
Ranking candidates are multi-partner under this proxy; collisions possible if two people share age/gender/prefs/hobbies in a wave.
