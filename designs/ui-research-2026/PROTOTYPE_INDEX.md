# PROTOTYPE_INDEX — 视觉探索原型总索引

> Branch: `design/ui-research-2026-v1` · 基线 RC `534e3c9` · 产出均为**候选原型**，严禁用于正式小程序。
> 浏览方式：GitHub 直接打开 HTML（自包含、无依赖），或本地 `python -m http.server 4311 --directory <repo根>` 后访问 `/designs/ui-research-2026/<file>.html`。
> 大图：`screenshots/`（390 逻辑宽 ×2 缩放 PNG）。

## 一、六套视觉语言总览（Round 1 — 已通过盲测发散评审 PASS）

| 方向 | 一句话 | Home | New Match Reveal | 盲测分 |
|---|---|---|---|---|
| A Editorial | 每周只介绍一位对象的独立杂志 | [home-a](./home-a-editorial.html) · [图](./screenshots/home-a-editorial.png) | [reveal-a](./reveal-a-editorial.html) · [图](./screenshots/reveal-a-editorial.png) | 7/10 |
| B Match File | 认真维护的恋爱档案卷宗 | [home-b](./home-b-match-file.html) · [图](./screenshots/home-b-match-file.png) | [reveal-b](./reveal-b-match-file.html) · [图](./screenshots/reveal-b-match-file.png) | 8/10 |
| C Date Pass | 匹配→约会的邀请函/票券 | [home-c](./home-c-date-pass.html) · [图](./screenshots/home-c-date-pass.png) | [reveal-c](./reveal-c-date-pass.html) · [图](./screenshots/reveal-c-date-pass.png) | 9/10 |
| D Quiet Luxury | 私人介绍服务级静奢信札 | [home-d](./home-d-quiet-luxury.html) · [图](./screenshots/home-d-quiet-luxury.png) | [reveal-d](./reveal-d-quiet-luxury.html) · [图](./screenshots/reveal-d-quiet-luxury.png) | 8/10 |
| E Soft Brutalism | 强排版强状态的软新粗野 | [home-e](./home-e-soft-brutalism.html) · [图](./screenshots/home-e-soft-brutalism.png) | [reveal-e](./reveal-e-soft-brutalism.html) · [图](./screenshots/reveal-e-soft-brutalism.png) | 9/10 |
| F AI Future | signal 收敛的 AI 原生浪漫 | [home-f](./home-f-ai-future.html) · [图](./screenshots/home-f-ai-future.png) | [reveal-f](./reveal-f-ai-future.html) · [图](./screenshots/reveal-f-ai-future.png) | 10/10 |

评审详情：[../project-docs/research/ui-ux-2026/DIVERGENCE_REVIEW.md](../project-docs/research/ui-ux-2026/DIVERGENCE_REVIEW.md)

## 二、Top 3 扩展（Round 2 — C / E / F × 5 页面）

> 选择理由见 DIVERGENCE_REVIEW §五；**此为探索预算分配，不是最终风格选择**。

### C Date Pass（深夜票务）

| 页面 | 原型 | 大图 |
|---|---|---|
| Match Detail | [detail-c](./detail-c-date-pass.html) | [图](./screenshots/detail-c-date-pass.png) |
| Date Coordination | [coord-c](./coord-c-date-pass.html) | [图](./screenshots/coord-c-date-pass.png) |
| AI Assistant（服务台） | [assistant-c](./assistant-c-date-pass.html) | [图](./screenshots/assistant-c-date-pass.png) |
| AI Report（票背报告） | [report-c](./report-c-date-pass.html) | [图](./screenshots/report-c-date-pass.png) |
| My（持票人卡） | [profile-c](./profile-c-date-pass.html) | [图](./screenshots/profile-c-date-pass.png) |

### E Soft Brutalism（新粗野海报）

| 页面 | 原型 | 大图 |
|---|---|---|
| Match Detail | [detail-e](./detail-e-soft-brutalism.html) | [图](./screenshots/detail-e-soft-brutalism.png) |
| Date Coordination | [coord-e](./coord-e-soft-brutalism.html) | [图](./screenshots/coord-e-soft-brutalism.png) |
| AI Assistant（AI 值班板） | [assistant-e](./assistant-e-soft-brutalism.html) | [图](./screenshots/assistant-e-soft-brutalism.png) |
| AI Report | [report-e](./report-e-soft-brutalism.html) | [图](./screenshots/report-e-soft-brutalism.png) |
| My | [profile-e](./profile-e-soft-brutalism.html) | [图](./screenshots/profile-e-soft-brutalism.png) |

### F AI Future Romance（柔粉信号雷达）

| 页面 | 原型 | 大图 |
|---|---|---|
| Match Detail | [detail-f](./detail-f-ai-future.html) | [图](./screenshots/detail-f-ai-future.png) |
| Date Coordination | [coord-f](./coord-f-ai-future.html) | [图](./screenshots/coord-f-ai-future.png) |
| AI Assistant（信号对话） | [assistant-f](./assistant-f-ai-future.html) | [图](./screenshots/assistant-f-ai-future.png) |
| AI Report（信号报告） | [report-f](./report-f-ai-future.html) | [图](./screenshots/report-f-ai-future.png) |
| My | [profile-f](./profile-f-ai-future.html) | [图](./screenshots/profile-f-ai-future.png) |

## 三、产线与规范

- 制作合同：[SPEC.md](./SPEC.md)（统一 mock 数据/红线/差异矩阵/工艺规范）
- baoyu-design→DSH 产线：[_adapter/BAOYU_DSH_ADAPTER.md](./_adapter/BAOYU_DSH_ADAPTER.md)（含截图管线脚本与踩坑实录）
- 参考来源：[../project-docs/research/ui-ux-2026/REFERENCE_INDEX.md](../project-docs/research/ui-ux-2026/REFERENCE_INDEX.md)

## 四、决策等待中

六套中 **C / E / F** 已扩展至七页深度；**B 为第一候补**（档案隐喻温暖可信），**A / D 暂停**（盲测唯一相近对）。
**最终风格由用户选定**——选定后该方向可无缝补齐其余页面并进入正式落地评估（另行立项，不在本研究分支）。
