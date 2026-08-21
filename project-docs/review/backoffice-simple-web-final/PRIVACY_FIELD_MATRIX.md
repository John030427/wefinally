# PRIVACY_FIELD_MATRIX

## Partner → member application (list + detail)

| Field | Partner | Admin |
|---|---|---|
| id / user_id / status / revision | YES | YES |
| review_note / submitted_at / reviewed_at | YES | YES |
| profile_summary (city/edu/occupation/birth_year) | YES | YES |
| profile_snapshot_json | **NO** | YES (admin ops) |
| raw_ai / AI inference | **NO** | YES |
| openid / phone full | **NO** | Admin CS limited; OpenID super only |
| phone_masked | YES | YES |
| reviewed_by_id / reviewed_by_role | **NO** | YES |
| ab_test_fixture / ab_test_run_id | **NO** | YES |
| unknown future fields via Object.assign | **NO** (allowlist only) | N/A |

Projection: `projectPartnerApplicationItem` / `sanitizePartnerApplication`.
