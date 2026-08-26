# UI/UX 视觉研究 2026 — WeFinally

> Branch: `design/ui-research-2026-v1` · Baseline RC: `534e3c991d177be0bd0e04bf8d9b586714bf72b6`
>
> **GitHub 为本任务唯一 source of truth。** 本目录所有产出（研究、截图索引、六套方案、prototype）均以本仓库为准。

## 性质

本轮是**视觉调研 + 候选 prototype**，不是正式 UI 开发：

- 正式小程序 UI：**DO NOT MODIFY**（不改 `miniprogram/` 任何页面）
- deploy：**NO**
- wechat upload：**NO**
- 不替用户决定最终风格，只推荐

## 文档清单

| 文件 | 内容 |
|---|---|
| [RESEARCH_FINDINGS.md](./RESEARCH_FINDINGS.md) | 上一轮结论：四套方案败于共享同一 AI 默认骨架；多方案须在 ≥6 个维度真实不同 |
| [SKILL_STACK_RECOMMENDATION.md](./SKILL_STACK_RECOMMENDATION.md) | ⚠️ 缺失：源 zip 未包含此文件（blocker 已记录，待用户补传后归档） |
| [LOCAL_CAPTURE_AND_PROTOTYPE_PLAN.md](./LOCAL_CAPTURE_AND_PROTOTYPE_PLAN.md) | 本地浏览器截图补采计划（XHS 搜索词、来源清单、30–60 张采集规范、blind divergence gate） |
| [UI_A_EDITORIAL.md](./UI_A_EDITORIAL.md) | 方向 A — Independent Editorial：每周一位对象的独立杂志 |
| [UI_B_MATCH_FILE.md](./UI_B_MATCH_FILE.md) | 方向 B — Japanese Match File：认真维护的恋爱档案 |
| [UI_C_DATE_PASS.md](./UI_C_DATE_PASS.md) | 方向 C — Date Pass / Invitation Ticket：匹配→约会的邀请函可视化 |
| [UI_D_QUIET_LUXURY.md](./UI_D_QUIET_LUXURY.md) | 方向 D — Quiet Luxury：私人介绍服务级克制 |
| [UI_E_SOFT_BRUTALISM.md](./UI_E_SOFT_BRUTALISM.md) | 方向 E — Soft Neo-Brutalism：强排版强状态块的边界方案 |
| [UI_F_AI_FUTURE.md](./UI_F_AI_FUTURE.md) | 方向 F — AI-native Future Romance：signal 收敛隐喻，拒绝紫色 SaaS |
| [DSH_GOAL_PROMPT.md](./DSH_GOAL_PROMPT.md) | 长时 Goal 执行指令（本轮任务的权威执行规范） |

## 执行摘要（来自 DSH_GOAL_PROMPT.md）

1. 读全部研究文档
2. 研究 Anthropic frontend-design / baoyu-design / UI/UX Pro Max 及可验证的 Impeccable / Anchor UI 等
3. 真实浏览器补采 XHS、Reddit、HN、Product Hunt、GitHub、Dribbble/Behance → 30–60 张高质量截图 + `REFERENCE_INDEX.md`
4. baoyu-design 改造成 DSH 可调用的 design-exploration adapter（仅用于 prototype）
5. 六套真正不同的视觉语言；禁止同骨架换皮（IA / typography / spatial composition / card morphology / CTA / iconography / match reveal / AI representation / motion / density 至少 6 项不同）
6. 先出 6×Home + 6×New Match Reveal 大图，做 blind divergence review
7. 仅 Top3 扩展为 Match Detail / Date Coordination / AI Assistant / AI Report / My
8. 全部文档化并 push GitHub；不 merge / 不 deploy / 不上传

## 阻塞与降级策略

XHS 登录受阻、浏览器超时、模型未响应 → 记录 blocker，重试或换来源继续，不停止整个 Goal。
