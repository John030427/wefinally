# Native Data Source Audit v1.5

## Status: WAITING_NATIVE_ID_DATA

No local native iid/pid file was ingested. License gates were **not** weakened. No automatic Kaggle/GitHub mirror download.

## Preferred auditable sources (research only)

| Candidate | URL | Publisher | Notes |
|-----------|-----|-----------|-------|
| Columbia ARM examples (Gelman) | http://www.stat.columbia.edu/~gelman/arm/examples/speed.dating/ | Columbia Statistics / teaching materials | Commonly cited as retaining **iid/pid/wave**; access/terms must be verified before import |
| Fisman et al. QJE paper | https://business.columbia.edu/sites/default/files-efs/pubfiles/867/fisman%20iyengar.pdf | Authors / QJE | Paper; data key describes iid/pid |
| OpenML speed-dating | OpenML dataset (existing sandbox) | OpenML redistrib | **Lacks iid/pid** — already on disk; fingerprint only |

## Current sandbox file

- Path: `datasets/wefinally/raw/speed-dating/speed-dating.csv`
- Fields: wave, gender, age, decision, decision_o, match, … — **no iid, no pid**
- Provenance: OpenML-style; source-registry **REVIEW_REQUIRED**, rag=false
- Row count: 8378 (header + data)

## Import path when native file is legally obtained

1. Place CSV at `datasets/wefinally/raw/speed-dating/speed-dating-native-iid-pid.csv`
2. Required columns: `iid`, `pid`, `wave`, `dec|decision`, `dec_o|decision_o` (`match` recommended)
3. Keep REVIEW_REQUIRED / sandbox / rag=false
4. Run `npm --prefix server run data:wefinally:match-v15`
5. identity_mode → `NATIVE_IID_PID`, TRUE_RECIPROCAL_AVAILABLE → true

## Explicit non-actions

- Did not download Kaggle `annavictoria/speed-dating-experiment` automatically
- Did not change source-registry license status
- Did not invent a fresh sealed set from inspected data
