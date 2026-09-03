# BASELINE_RESULTS

Initial baseline passed backoffice, AI waiting, Mini Program syntax, release guard, safety, agent core, match v1.8, full agent, AI report, CloudPay, Cloud Match, and E2E 14/14.

Initial `selfcheck:member` failed because the fixed-date internal VIP fixture reached wall-clock expiry; root cause was `isVipActive(user, now)` ignoring the supplied clock. After the minimal fix, the full member suite passed.

Live MySQL: `BLOCKED_ENVIRONMENT` (`127.0.0.1:3306` closed). No database was created, migrated, seeded, or modified.
