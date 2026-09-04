# Release Manifest Template

每次部署 `api`、部署 `agent-graph`、或上传小程序客户端时，复制本模板到 `project-docs/releases/` 并填写。  
客户端上传与云函数部署是独立动作；未填写本清单不得发布。

## Identity

| Field | Value |
|---|---|
| release_name | |
| owner | |
| date_utc8 | |
| source_branch | |
| source_commit | |
| rollback_commit | |
| cloud_env | |
| notes | |

## Deployed artifacts

| Artifact | Commit | Operator | Time (UTC+8) | Result |
|---|---|---|---|---|
| api_deploy_commit | | | | |
| agent_graph_deploy_commit | | | | |
| miniprogram_upload_commit | | | | |

## test_results

| Gate | Command | Result | Evidence |
|---|---|---|---|
| agent | `npm --prefix server run selfcheck:agent` | | |
| safety | `npm --prefix server run selfcheck:safety` | | |
| ai-report | `npm --prefix server run selfcheck:ai-report` | | |
| cloudpay | `npm --prefix server run selfcheck:cloudpay` | | |
| member | `npm --prefix server run selfcheck:member` | | |
| cloud-match | `npm --prefix server run selfcheck:cloud-match` | | |
| qa-pair-reset | `npm --prefix server run selfcheck:qa-pair-reset` | | |
| wx-identity | `npm --prefix server run selfcheck:wx-identity` | | |
| agent-graph | `npm --prefix miniprogram/cloudfunctions/agent-graph run check` | | |
| live_graph_smoke | MANUAL_REQUIRED | | |

## dependency_baseline

记录精确版本与升级约束；禁止在发布线执行 `npm audit fix --force`。

| Package | Locked version | Surface | Upstream constraint | Mitigation |
|---|---|---|---|---|
| `@cloudbase/node-sdk` (api) | 3.17.2 | DB/auth/cloud calls in `api` | caret `^3.16.0` in package.json | Upgrade only on a dedicated branch; rerun agent-graph check, DB txn selfchecks, cloud smoke |
| `@cloudbase/node-sdk` (agent-graph) | 3.17.2 | checkpoint + model generateText | caret `^3.16.0` | Same as above; verify checkpoint restore |
| `wx-server-sdk` (api) | 4.0.2 | WeChat cloud function runtime | pinned | Do not float without cloud runtime validation |
| `axios` (transitive via CloudBase) | 0.27.2 | HTTP from CloudBase SDK | transitive | Monitor advisories; do not force-upgrade through audit fix |
| `@langchain/langgraph` | 1.4.9 | agent-graph orchestration | pinned in agent-graph package.json | Rebuild dist + run 42+ graph tests |

## Sign-off

- [ ] Source commit matches the deployed/uploaded artifact
- [ ] No production secrets were written into git, logs, or this manifest
- [ ] Rollback commit is known and deployable
- [ ] Dual-device QA scenarios completed or explicitly deferred with owner
