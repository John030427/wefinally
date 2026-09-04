# Flexible location review deployment

## Identity

| Field | Value |
|---|---|
| release_name | flexible-location-review-20260904 |
| owner | Codex / user dual-device QA |
| source_branch | fix/flexible-date-location-2026-09-04 |
| source_commit | 6096f6a833af897ef0bb486adfe6bbc216ea1f55 |
| rollback_commit | b13aa635d08eff88f73c207d2fdf32887d9f5828 (source baseline, not proven identical to deployed predecessor) |
| cloud_env | cloud1-d4gy8l52g08bba326 / ap-shanghai |
| scope | api + agent-graph code only; no client upload, no data reset, no config/permission change |

## Deployed artifacts

| Artifact | Commit | Result |
|---|---|---|
| api_deploy_commit | 8f929f004ec5a9113781ae69101c44a032e7fed9 | PASS — updated 2026-09-04 13:50:22 UTC+8 |
| agent_graph_deploy_commit | 8f929f004ec5a9113781ae69101c44a032e7fed9 | PASS — updated 2026-09-04 13:50:25 UTC+8 |
| miniprogram_upload_commit | NONE | NOT_UPLOADED |

## test_results

| Gate | Result |
|---|---|
| selfcheck:agent | PASS (including flexible chain and actual db transaction functions with database test double) |
| selfcheck:safety | PASS |
| selfcheck:ai-report | PASS |
| selfcheck:cloudpay | PASS |
| selfcheck:member | PASS |
| selfcheck:cloud-match | PASS |
| selfcheck:qa-pair-reset | PASS |
| selfcheck:wx-identity | PASS |
| agent-graph check | PASS: build + 42 tests |
| release-workflow-contract | PASS |
| git diff --check | PASS |
| CloudBase code review | No new SDK/auth API, no new collections. Existing participant authorization and current-version transaction CAS retained; accepted_by untrusted. Web session rules inapplicable to native WeChat auth. |
| live_graph_smoke | MANUAL_REQUIRED: health does not prove a real model coordination journey |
| dual-device | Deferred to user after client test upload; explicitly confirmed in this task |

## Runtime and rollback

- api: existing Event / index.main / Nodejs16.13 / 60 seconds.
- agent-graph: existing Event / index.main / Nodejs20.19 / 120 seconds.
- CloudBase MCP authenticated environment verified before deployment. Only updateFunctionCode is allowed here; keep secrets, runtime, permissions and timeout unchanged.
- Clean staging: `.deploy/flexible-location-20260904/source/miniprogram/cloudfunctions/` from git archive of source_commit. Graph dist built and shared contract checked against source. No local node_modules or .env in staging.
- Prior code archives stored outside git at `.deploy/flexible-location-20260904/rollback/`.
- api previous archive SHA256: `6d80f5018d533eed7179ffbaf1a0164aa7b300079f43bdd8a09476ed3072fde3`.
- agent-graph previous archive SHA256: `9304a06601012b0469da344225540d5a608b67a37e1c64d6004b098e7246d34e` (verified from curl archive).
- Rollback should use verified previous cloud archives, not assume the source baseline is the previously deployed build. Restore code only with existing configuration, then invoke health. No data migration occurred.
- CLS topic is not configured in current function detail; cloud logs are not validation evidence for this release.

## dependency_baseline

No dependencies changed. Existing locks retained: @cloudbase/node-sdk 3.17.2; wx-server-sdk 4.0.2; @langchain/langgraph 1.4.9. No audit fix or runtime upgrade.

## Sign-off

- [x] Source commit identified; staged source from git archive.
- [x] User confirmed code deployment, keeping configuration and records unchanged.
- [x] No secrets committed.
- [x] Dual-device QA explicitly deferred to user.
- [x] Both predecessor archives downloaded and hashes verified.
- [x] Both functions Active / Available after update; api `ping` and agent-graph `health` pass.

Testing steps: `project-docs/plans/2026-09-04-flexible-location-regression.md`.
