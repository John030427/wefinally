# Feature Identity Audit v1.5.2 (+ final fix)

## Orchestration FeatureView

May hold `metadata: { wave, iid, pid, directed_key }` for pairing / split / audit.

## Model input

`buildNativeModelInput` → `{ features }` only.

Predictor **cannot** read:

- `metadata`
- `iid` / `pid` / `wave`
- `directed_key` / `reverse_key` / `row_index`

Throws `MODEL_INPUT_IDENTITY_FORBIDDEN`.
