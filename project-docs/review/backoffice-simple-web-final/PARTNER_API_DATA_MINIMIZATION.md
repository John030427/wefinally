# Partner API Data Minimization

## Changes
- Express `GET /partner/users`: no `openid` in SELECT; `formatPartnerUser` → sanitized DTO
- Express audit `view`: narrow columns + `sanitizePartnerApplication`
- Express/Cloud login: `phone_masked` instead of full phone
- Cloud `GET /partner/member-applications/:id`: sanitized user + application for partner role; cross-partner denied

## Policy
Return only onboarding/review/commission fields. Never send AI private sessions, match reasoning, or other partners’ users.
