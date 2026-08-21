# FREEZE_DECISION

OFFLINE_ENGINEERING:
FREEZE_READY

REAL_WECHAT_STAGING:
READY_FOR_MANUAL_AB

PRODUCTION:
KEEP_CURRENT

## Why

- Ranking both-sides integrity PASS; pair AP unchanged; structured ML still not production
- HY3 corrected to PASS for product reasoning role = staging profile+coordination (not core ranker)
- Automated E2E 14/14 PASS after wx-server-sdk install
- Live CloudBase HY3 smoke PASS but CODE_MISMATCH vs local branch (no deploy)
- True two-account WeChat requires human devices → READY_FOR_MANUAL_AB
