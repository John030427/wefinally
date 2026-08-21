# Feature Identity Audit v1.5.2

`iid`, `pid`, `wave` live only in `featureView.metadata`.

`featureView.features` contains PRE_MATCH attributes only.

Top-level `fv.iid` / `fv.pid` / `fv.wave` throws `MODEL_FEATURE_IDENTITY_FORBIDDEN`.
