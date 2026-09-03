# PRIVACY_FIELD_MATRIX

## Partner → member application

| Field | Partner | Admin |
|---|---|---|
| profile_summary | YES | YES |
| profile_snapshot_json / raw_ai / openid / ab_test_* | NO | Admin ops only |

## Customer Service API

| Field | Allowed |
|---|---|
| user_id / user_ref / support_code | YES |
| openid / user_openid / match_user_openid / unionid | **NO** |
| order amount/status | YES |
| match display status / coordination_state | YES |
| raw score internals | NO (CS match detail) |

## Finance API

| Field | Allowed |
|---|---|
| order_no / amount / pay / settle / commission | YES |
| openid / phone / private profile / AI / match | **NO** |
| partner_phone | **MASKED_ONLY** |

## Auditor user detail

| Field | Allowed |
|---|---|
| basic profile / member status / agreements_status | YES |
| openid | **NO** |
| match_settings | **NO** |
| privacy_auth_logs (raw) | **NO** |
