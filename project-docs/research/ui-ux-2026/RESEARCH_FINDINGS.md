# WeFinally UI Research Findings

## 结论
上一轮四套方案的问题不是配色，而是共享同一套“圆角卡片 + 居中CTA + 柔阴影 + 粉色渐变”的 AI 默认骨架。真正的多方案应在布局、字体、信息密度、卡片形态、CTA、图标、动效、Match Reveal、AI 表征等至少 6 个维度明显不同。

## Skills
### Anthropic frontend-design
官方 skill 强调先确定鲜明 aesthetic direction，再编码；明确反对 generic AI slop、紫色渐变、模板化卡片、默认字体和可预测布局。它适合做“发散/审美方向”。

### UI/UX Pro Max
偏结构化设计智能：design system、UX rules、platform guidelines、feedback layer。更适合做“收敛/一致性/可用性复核”。

### Baoyu Design
baoyu-skills 官方 README 指向独立 baoyu-design，可在 Cursor/Claude Code/Codex 等文件型 agent 中生成 HTML mockup / interactive prototype。适合做“可见原型”，而不是只写设计形容词。

## 社区经验
近期 Reddit / ClaudeCode / vibecoding 讨论反复出现：
- 功能能做出来，但 UI 很 generic；
- 只给文字 brand guide 往往不够；
- 视觉参考 + screenshot + HTML prototype + browser feedback loop 更有效；
- 一次生成后不停小修容易陷入局部最优；
- 最佳做法往往是先 plan/visual explore，再 prototype，再接入真实代码。

## Hacker News / vibe coding 产品经验
Superflex 强调 design-to-code 要匹配现有 codebase/design system；v0/Lovable 类工具更适合作为 prototype generator；一些 Show HN 产品也强调 browser preview 和多轮 UI/UX iteration。

## XHS 限制
当前远程搜索环境无法稳定检索小红书相关帖子，因此不伪造 XHS 样本。建议本地 DSH/Codex 用真实浏览器登录/截图完成 XHS 补采。

## 对 WeFinally 的启发
保留：
- 上手就会用
- 一屏一个主动作
- 匹配到达有仪式感
- 状态清楚
- AI 是服务，不是权威
- 强化“从匹配走向真实约会”

避免：
- swipe/feed 逻辑
- 爱心泛滥
- pastel card soup
- 伪 AI 分数
- 紫色 SaaS 渐变
- 所有页面都长成同一套卡片。
