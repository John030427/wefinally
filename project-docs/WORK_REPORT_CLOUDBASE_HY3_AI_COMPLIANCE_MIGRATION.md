# WeFinally CloudBase Hy3 AI Compliance Migration

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `351364a6b429e13eae03811bec07921622743d68` |
| Remote HEAD (start) | `351364a6b429e13eae03811bec07921622743d68` |
| Dirty Files (preserved, not committed) | `miniprogram/project.config.json`, `server/public/partner/index.html`, `server/selfcheck/cloudbase-partner-connection.js`, `server/selfcheck/customer-service-browser-fixture.js`, `.cursor/`, `config/`, root `project.config.json`, assorted docs/specs |

## 2. CloudBase Growth Plan

| Item | Result |
|---|---|
| Environment | `cloud1-d4gy8l52g08bba326` (Normal) |
| Token package | `pkg_hunyuan_token_la_inspire_1b` — 1B tokens remaining |
| Image package | `pkg_hunyuan_ai_image_la_inspire_100k` |
| `cloudbase` group before | Empty `Models[]` |
| Action taken | `UpdateAIModel` enabled `hy3` in `cloudbase` group |
| hy3 availability | **YES** — `DescribeAIModels` shows `cloudbase` → `hy3` |
| Also present | `hunyuan-v3` group with `hy3-preview` (not used as default) |
| Requires new Hunyuan API Key | **NO** |
| New AI secrets added | **NO** |

## 3. AI Inventory

| Feature | Old Provider | Old Model | New Provider | New Model | User Visible | AI Disclosure |
|---|---|---|---|---|---|---|
| Platform AI 客服 | DeepSeek HTTPS | deepseek-chat | CloudBase | hy3 | Yes | Chat disclaimer |
| AI 恋爱助手 | DeepSeek | deepseek-chat | CloudBase | hy3 | Yes | love-advisor disclosure |
| AI 约会协调员 (api) | DeepSeek | deepseek-chat | CloudBase | hy3 | Yes | Chat + date-coordination card |
| LangGraph date coordinator | DeepSeek fetch | deepseek-chat | CloudBase | hy3 | Yes (chat) | Chat disclaimer |
| LangGraph platform CS | DeepSeek fetch | deepseek-chat | CloudBase | hy3 | Yes | Chat disclaimer |
| AI Match Report | DeepSeek HTTPS | deepseek-chat | CloudBase | hy3 | Yes | match-detail `AI生成内容，仅供参考` |
| Match semantic rerank | DeepSeek HTTPS | deepseek-chat | CloudBase | hy3 | No (internal) | N/A |
| Structured match explanation | DeepSeek HTTPS | deepseek-chat | CloudBase | hy3 | Yes (report sections) | match-detail disclaimer |
| AI 对你的理解 | Deterministic compile + tags | N/A | No LLM path changed | N/A | Yes (profile card) | match-setting disclaimer |
| Bilateral match ranking | Deterministic + optional rerank | N/A | Rerank → CloudBase hy3 | hy3 | Partial | N/A |
| Matching hard rules / scores | Deterministic | N/A | Unchanged | N/A | No | N/A |

## 4. Unified Provider

| Item | Location |
|---|---|
| Core module | `miniprogram/cloudfunctions/api/lib/cloudbaseAi.js` |
| Agent decisions | `miniprogram/cloudfunctions/api/agent/provider.js` → `requestCloudbaseProvider` |
| Match reports / rerank | `miniprogram/cloudfunctions/api/lib/deepseek.js` → `invokeChatCompletion` |
| LangGraph LLM | `miniprogram/cloudfunctions/agent-graph/src/model.ts` → `createCloudbaseDecisionModel` |
| Runtime config exposed | `GET /api/common/config` → `ai_runtime`, `ai_provider_contract_version: 1` |
| SDK | `@cloudbase/node-sdk` ≥ 3.16 in `api` and `agent-graph` |

Production default: `AI_PROVIDER` unset → `cloudbase` / `hy3`. Legacy DeepSeek only when `AI_PROVIDER=deepseek` explicitly.

## 5. DeepSeek

| Item | Status |
|---|---|
| Production paths removed | Agent, match AI, LangGraph default |
| Legacy code retained | `provider.js` OpenAI path, `deepseek.js` HTTPS path, `createDeepseekDecisionModel` |
| Production silent fallback to DeepSeek | **NO** — failures → safe `fallback` provider message |
| Cloud env `DEEPSEEK_API_KEY` | **Retained** (not deleted) |
| Cloud env `AGENT_PROVIDER=deepseek` | **Retained** but **ignored** unless `AI_PROVIDER=deepseek` |

## 6. LangGraph

- Orchestration unchanged (thread, checkpoint, tools, date coordination graph).
- LLM adapter switched to CloudBase `createModel("cloudbase")` + `model: "hy3"`.
- Structured output: Zod `RawDecisionSchema` + `ModelBoundaryError` on invalid JSON — no DB write on parse failure.
- Privacy: existing `sanitizeGraphText` + context boundaries unchanged.

## 7. AI Match

| Surface | Migration |
|---|---|
| Structured reports | `deepseek.js` → `invokeChatCompletion` → CloudBase hy3 |
| Mutual reports | Same |
| Semantic rerank | Same when enabled |
| Hard gates / bilateral score | Deterministic — unchanged |

## 8. AI Customer Service

| Surface | Migration |
|---|---|
| Platform 客服 | `generateDecision` → CloudBase hy3 |
| 恋爱助手 | Same agent path |
| Knowledge RAG | Unchanged retrieval; generation via unified provider |

## 9. Date Coordinator

| Item | Status |
|---|---|
| Provider | CloudBase hy3 |
| Structured output | JSON decision schema + patch preview unchanged |
| Patch safety | Deterministic validation before apply — unchanged |
| UI gate | `collecting_initiator` no longer opens coordinator chat |

## 10. AI Disclosure Audit

| Surface | Status |
|---|---|
| Chat (客服/恋爱/协调) | PASS — AI 生成回复仅供参考 |
| love-advisor | PASS |
| match-detail report | PASS |
| match-setting AI profile | PASS |
| date-coordination pre-submit card | PASS — AI生成内容，仅供参考 |
| date-coordination active CTA card | PASS — disclosure added |
| Summary card (为什么值得了解) | Deterministic — no AI label required |

## 11. Date UI Fix

| State | UI |
|---|---|
| `collecting_initiator` | Pre-submit card only; **no** “正在帮助双方寻找共同安排”; **no** coordinator CTA |
| `inviting_partner` (initiator, submitted) | Active coordinator CTA + 开启协调提醒 |

Backend: `canOpenCoordinatorChat` returns `false` for `collecting_initiator`.

## 12. Tests

| Command | Result |
|---|---|
| `npm --prefix server run selfcheck:cloudbase-ai` | PASS (AI PROVIDER TEST 01–16) |
| `npm --prefix server run selfcheck:agent-core` | PASS |
| `npm --prefix server run selfcheck:langgraph` | PASS |
| `npm --prefix server run selfcheck:first-date-invitation-coordination` (via langgraph script) | PASS |
| `npm --prefix server run selfcheck:ai-profile-bilateral` | PASS |
| `npm --prefix miniprogram/cloudfunctions/agent-graph run check` | PASS (38 tests) |
| `server/selfcheck/cloudbase-ai-live-smoke.js` | PASS (live) |

## 13. Live CloudBase AI Smoke

| Field | Value |
|---|---|
| Method | Deployed `api` action `aiSmoke` (worker-authenticated) |
| provider | `cloudbase` |
| model | `hy3` |
| input | `只回复：HY3_OK` |
| result text | `HY3_OK` |
| latencyMs | ~1169 |
| ok | `true` |

## 14. CloudBase Deployment

| Function | Before | After | Method |
|---|---|---|---|
| api | Nodejs16.13, old code | Nodejs20.19, unified provider | `tcb fn deploy api` from `miniprogram/` + `cloudbaserc.json` |
| agent-graph | Nodejs20.19 | Nodejs20.19, CloudBase model | `tcb fn deploy agent-graph` from `miniprogram/` |

**Important:** Deploy must run from `miniprogram/` directory with `cloudbaserc.json`. Deploying with `--dir` to a temp folder alone did not update live code.

## 15. Environment Variables

| Change | Value |
|---|---|
| Added (recommended) | `AI_PROVIDER=cloudbase`, `AI_MODEL=hy3` (optional — code defaults suffice) |
| Changed | None via CLI this round |
| Removed | **NONE** |
| `DEEPSEEK_API_KEY` | **Still present** in cloud env; production no longer depends on it |

## 16. Database

Migration: **NO**

## 17. Git

(To be filled after commit/push)

## 18. Manual WeChat Verification

待人工验收：

- 平台 AI 客服回复与标识
- AI 恋爱助手
- AI 约会协调员（含 collecting / inviting CTA）
- AI Match Profile / 匹配报告
- Date UI collecting_initiator 不提前显示 active CTA

## 19. Remaining External Work

- 微信审核类目 / 算法备案材料
- Subscribe Template ID
- 体验版上传（本轮未执行）
- 人工 UI 验收
- 可选：在 CloudBase 控制台显式设置 `AI_PROVIDER=cloudbase` 并文档化 legacy `AGENT_PROVIDER=deepseek` 退役计划

---

Definition of Done: all code, tests, live hy3 smoke, deployment, and disclosure items addressed in this branch worktree.
