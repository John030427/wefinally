# Speed Dating Native iid/pid Migration Audit

**NATIVE_ID_DATASET_PREFERRED** — fingerprint is uncertain fallback only.

```json
{
  "NATIVE_ID_DATASET_PREFERRED": true,
  "headers_sample": [
    "has_null",
    "wave",
    "gender",
    "age",
    "age_o",
    "d_age",
    "d_d_age",
    "race",
    "race_o",
    "samerace",
    "importance_same_race",
    "importance_same_religion",
    "d_importance_same_race",
    "d_importance_same_religion",
    "field",
    "pref_o_attractive",
    "pref_o_sincere",
    "pref_o_intelligence",
    "pref_o_funny",
    "pref_o_ambitious",
    "pref_o_shared_interests",
    "d_pref_o_attractive",
    "d_pref_o_sincere",
    "d_pref_o_intelligence",
    "d_pref_o_funny",
    "d_pref_o_ambitious",
    "d_pref_o_shared_interests",
    "attractive_o",
    "sinsere_o",
    "intelligence_o",
    "funny_o",
    "ambitous_o",
    "shared_interests_o",
    "d_attractive_o",
    "d_sinsere_o",
    "d_intelligence_o",
    "d_funny_o",
    "d_ambitous_o",
    "d_shared_interests_o",
    "attractive_important"
  ],
  "has_iid": false,
  "has_pid": false,
  "has_wave": true,
  "has_decision": true,
  "has_decision_o": true,
  "has_match": true,
  "usable_native": false,
  "status": "FALLBACK_FINGERPRINT_REQUIRED",
  "identity_mode": "IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT",
  "skip_fingerprint": false,
  "note": "OpenML/GitHub datasets/speed-dating CSV lacks iid/pid. Provide Columbia-style file under raw/speed-dating/ with REVIEW_REQUIRED gates intact.",
  "inspected_path": "D:\\wefinal\\.worktrees\\wefinally-ai-agent\\datasets\\wefinally\\raw\\speed-dating\\speed-dating.csv",
  "generated_at": "2026-08-21T07:50:00.778Z"
}
```

## Import path (when native file available)

1. Place licensed Columbia-style CSV at `datasets/wefinally/raw/speed-dating/speed-dating-native-iid-pid.csv`
2. Keep `source-registry` status REVIEW_REQUIRED / rag=false
3. Re-run ingest with native detector → `identity_mode=native_iid_pid`
4. Do not fetch unknown mirrors automatically
