# DEPLOYMENT_ORDER

**Do not execute.** Dependency-aware recommended order for a future `DEPLOY_APPROVED` run:

1. **Freeze confirmation** — redeploy only from `301992878aceeea8ea71985bb37b4770f93e3dd7` (or documented successor).
2. **Backups** — download current remote `api` + `agent-graph`; Express filesystem snapshot; MySQL dump if Express path.
3. **Database** — only if MIGRATION_REQUIRED becomes YES after live schema compare; apply ordered patches; else skip.
4. **CloudBase `api`** — deploy freeze code (Node runtime alignment may update 16→20 per local cloudbaserc; treat as controlled change).
5. **Build + deploy `agent-graph`** — install, build `dist`, upload; confirm timeout/runtime.
6. **Leave `match-worker` / `login` / `report-worker` alone** unless a separate diff appears.
7. **Express server + Admin/Partner static** — if operators use Express topology; PM2 restart; ATOMIC_WITH_SERVER.
8. **Mini Program 体验版 upload** — AppID `wx91c6559ea4490a29`, env `cloud1-d4gy8l52g08bba326`.
9. **Smoke** — POST_DEPLOY_SMOKE_CHECKLIST (no production payment).
10. **Two-WeChat A/B** — human checklist.
11. **Role validation** — super_admin / CS / auditor / finance / partner.
12. **WeChat 审核/正式版** — only after explicit release approval (separate from deploy approval).

## Explicit non-goals this round

- Do not alter Wed/Fri match schedule.
- Do not add login/report-worker to cloudbaserc just to “normalize”.
- Do not 正式发布 Mini Program as part of first deploy wave.
