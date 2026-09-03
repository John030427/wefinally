# FINAL_REVIEW_FIX — External Review 关单修复

Branch: `feature/backoffice-simple-web-final`  
Date: 2026-08-21

## REVIEW-01 Partner application list full-document leak

**FIXED**

- Cloud `applicationList` for `actor.role === 'partner'` 不再 `Object.assign({}, application, …)`。
- 强制 `projectPartnerApplicationItem` → `sanitizePartnerApplication` allowlist。
- List 与 Detail 共用同一 privacy contract。
- 攻击用例：恶意字段 `SECRET_*` / `profile_snapshot_json` / `raw_ai` / `openid` / `ab_test_*` 不得出现在 `JSON.stringify(response)`。

## REVIEW-02 Partner ab_test_fixture exposure

**FIXED**

- Partner 投影路径不查询、不返回 `ab_test_fixture` / `ab_test_run_id`。
- Admin 路径仍可保留 fixture（运营/测试需要）。

## REVIEW-03 finance/auditor backend RBAC mismatch

**FIXED**

- Express：`server/src/utils/adminRbac.js` 精确 allowlist。
  - `auditor`：会员审核相关 GET/PUT + 用户/合伙人只读；禁止提现/会话。
  - `finance`：订单/提现；禁止会员审核/会话。
  - `customer_service`：客服工作台/会话/工单/必要订单与匹配；禁止 OpenID。
  - `super_admin`：全部。
- Cloud Agent：conversation/ticket 仅 `super_admin` + `customer_service`（auditor 不再可读私聊）。
- Admin UI `ROLE_PAGES` 与 backend allowlist 对齐。

## REVIEW-04 AI unavailable falsely displayed normal

**FIXED**

- `buildAiOps`：`normal | degraded | unknown`。
- `agent_run` 查询失败 → `unknown` /「状态未知」/ `failed_today: null`，不再假「正常」。
- 无运行数据 → `unknown`，不硬编码 HY3 冒充事实。
- 有最新运行时展示实际 `provider`/`model`；配置目标单独标为 `expected_*`。

## REVIEW-05 A/B coordination UX

**FIXED**

- Backend `operator_view`：协调编号、第 N 版、A/B 确认、当前状态、下一步、方案更新失效提示。
- Admin 客服上下文使用运营文案；技术字段折叠在「技术详情」。

## REVIEW-06 private/shared labeling

**FIXED**

- A 私人会话 badge：`仅内部处理 · 不向 B 展示`
- B 私人会话 badge：`仅内部处理 · 不向 A 展示`
- shared：`双方共享进度`
- 不改变 backend privacy architecture。

## REVIEW-07 Customer Service / Finance / Auditor response data authorization

**FIXED**

- Customer Service：orders / handoff / workbench / matches DTO 不再返回 openid / user_openid / match_user_openid / unionid。
- Finance：`formatOrderForFinance` allowlist；withdraw phone 默认 masked。
- Auditor：`formatUserDetailForAuditor` 不含 openid、match_settings、raw privacy logs。
- Selfcheck 攻击实际 `JSON.stringify(DTO)`，不再仅靠 `canSeeOpenId`。
- 文档区分 `ROUTE_AUTHORIZATION` 与 `RESPONSE_DATA_AUTHORIZATION`（见 ROLE_DATA_PROJECTION_AUDIT.md）。
