# DATABASE_MIGRATION_AUDIT

## MIGRATION_REQUIRED

**UNKNOWN**

Cannot connect to production MySQL from audit host (`127.0.0.1:3306` closed → LIVE_MYSQL BLOCKED_ENVIRONMENT). CloudBase NoSQL collection inventory not listable via current `tcb db nosql` commands without dump.

## Local MySQL patch inventory (Express path)

Ordered patches present under `database/`:

1. `init.sql` (baseline)
2. `patch-002-partner-audit.sql`
3. `patch-004-free-whitelist.sql`
4. `patch-005-meet-report.sql`
5. `patch-006-appearance-llm.sql`
6. `patch-007-register-ux.sql`
7. `patch-008-match-psych-report.sql`
8. `patch-009-safety-whitelist-audit.sql`
9. `patch-010-meet-safety-share.sql`
10. `patch-011-match-handoff-ticket.sql`
11. `patch-012-admin-service-role.sql`
12. `patch-013-member-review.sql`
13. `patch-014-user-identity-province-ai-profile.sql`

**DO NOT execute** in this audit.

## CloudBase NoSQL (api path)

Collections mapped in `miniprogram/cloudfunctions/api/lib/collections.js` include (names only):

`users`, `member_applications`, `partners`, `agent_sessions`, `agent_runs`, `agent_messages`, `agent_human_tickets`, `date_coordinations`, `date_confirmations`, `date_proposals`, `date_applications`, `date_coordination_events`, `user_match_logs`, `ai_report_tasks`, …

Remote existence/indexes: **UNKNOWN** (no safe list API used). Historical production traffic implies many already exist; do not invent create/drop in this run.

## Guidance for a future authorized deploy

1. Confirm whether target path is Express/MySQL, CloudBase NoSQL, or both.
2. For MySQL: compare information_schema against patch list before applying any patch.
3. For NoSQL: verify critical collections/indexes exist; create missing indexes only under explicit approval.
4. Never DROP/TRUNCATE/seed production during readiness.
