# PARTNER_API_DATA_MINIMIZATION

## Contract

Partner `GET /api/partner/member-applications` and `GET /api/partner/member-applications/:id` MUST:

1. Never `Object.assign({}, application, …)`
2. Call `projectPartnerApplicationItem` / `sanitizePartnerApplication`
3. Attach only safe `user` via `sanitizePartnerUser`
4. Never return `ab_test_fixture`, snapshots, openid, full phone, internal review actor ids

## Attack test

Malicious fake application with `SECRET_*` tokens must not appear in `JSON.stringify(response)`.

Selfcheck names:

- PARTNER_APPLICATION_LIST_NO_PROFILE_SNAPSHOT
- PARTNER_APPLICATION_LIST_NO_RAW_APPLICATION_SPREAD
- PARTNER_APPLICATION_LIST_NO_AB_TEST_FIXTURE
- PARTNER_APPLICATION_DETAIL_NO_PROFILE_SNAPSHOT
- PARTNER_APPLICATION_LIST_ALLOWLIST_ONLY
