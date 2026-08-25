# RESEARCH_SUMMARY — 婚恋产品 UI/UX 模式调研（轻量）

> Goal: WEFINALLY_UI_UX_REFACTOR_GOAL_V1 · Stage 1
> 方法：轻量桌面调研 + 模式归纳，不照抄任何产品；只取与 WeFinally「认真婚恋 / 官方协调 / 无私聊」定位相容的模式。

## 1. 调研对象与来源

- **Coffee Meets Bagel（CMB）**：定时精选匹配、下一批倒计时、认真约会导向。
  参考：[Rethinking the Design of Modern Dating Apps: Coffee Meets Bagel (UX Planet)](https://uxplanet.org/rethinking-the-design-of-modern-dating-apps-for-ultimate-user-experience-coffee-meets-bagel-df818c06991a)、
  [CMB Launches Major Redesign as Gen Z Moves Beyond Swipe Culture (DatingNews)](https://www.datingnews.com/apps-and-sites/coffee-meets-bagel-launches-major-redesign-as-gen-z-moves-beyond-swipe-culture/)
- **Hinge**：人物画像深度展示、"designed to be deleted"、prompts 引导真实表达。
- **Bumble**：状态明确、24h 轻压力机制、下一步动作可理解。
- 通用 2024–2025 婚恋 App UI 要点：[Purrweb Dating App UI/UX Tips](https://www.purrweb.com/blog/tips-to-create-a-successful-dating-app-ui-and-ux/)、
  [Must-Have Dating App Features (SkaDate)](https://www.skadate.com/time-to-stand-out-the-updated-list-of-must-have-features-for-a-dating-app-in-2024/)

## 2. 可借鉴模式（采纳）

| # | 模式 | 来源 | WeFinally 落地方式 |
|---|---|---|---|
| R1 | **定时精选 + 倒计时**：匹配是"被安排的事件"而非无限滑卡 | CMB | 首页"下一次介绍"卡保留并升级为视觉锚点（每周三/五 00:00），明确"不需要反复刷新" |
| R2 | **匹配到达的仪式感**：把新匹配当正式产品事件，而非 toast | CMB 精选批次心理 | 新增 `new-match-modal`：柔和渐变视觉中心 + 「WeFinally 为你匹配到一位对象」+ 主 CTA「查看匹配理由」 |
| R3 | **先看理由再决定**：解释性匹配（why this match）前置 | Hinge/CMB | 匹配详情页决策顺序重排：「为什么值得了解」紧跟状态头，算法细节默认折叠 |
| R4 | **状态词汇表统一**：用户随时知道流程在哪一步 | Bumble 状态设计 | 全局状态词：新匹配/待回应/协调中/已有最终安排/本次未成；约会协调页顶部统一状态卡 |
| R5 | **AI 等待态有尊严**：生成中有持续呼吸反馈、失败可重试、不吐半截内容 | 通用 AI 产品惯例 | `ai-thinking` 统一组件覆盖 chat/协调/报告生成 |
| R6 | **资料就绪度可视化**：让用户知道"我能被匹配的前提" | Hinge profile 完整度 | 我的页 readiness 卡保留并前置强化（已有基础） |

## 3. 不采纳模式（及原因）

| # | 模式 | 来源 | 不采纳原因 |
|---|---|---|---|
| N1 | 滑卡/swipe 海量候选人 | Tinder 系 | 与"官方按条件认真筛"定位冲突；霞姐业务是审核制+定时匹配 |
| N2 | 用户私聊/即时 IM | 几乎所有婚恋产品 | 平台红线：无私聊，仅平台一对一奔现对接（AGENTS.md 安全边界） |
| N3 | 头像社交墙/动态 feed | 泛社交产品 | 无头像原则；保护隐私 |
| N4 | 24h 过期倒计时施压 | Bumble | WeFinally 协调节奏由平台控制，制造焦虑违背"被照顾"体验 |
| N5 | 重娱乐化配对游戏（测验闯关等） | 部分新品 | 违背"上手就能干"，喧宾夺主 |

## 4. 对 WeFinally 的三条核心推论

1. **首页必须回答三个问题**：有没有新匹配？下一次什么时候来？我现在该点哪？
   —— 用 Hero 进度带（journeyState 已有）+ 下一次介绍卡 + 新匹配强提示三层结构回答。
2. **匹配详情页 = 决策文档，不是数据面板**：
   按「为什么值得了解 → 亮点 → 需要确认 → AI 建议 → 行动」排序，算法细节降级为折叠区。
3. **AI 的统一人格**：所有 AI 面（恋爱助手/客服/协调/报告）共用同一等待态、同一标识色（紫）、同一免责文案，
   让 AI 可信但不喧宾夺主。

## 5. 结论

WeFinally 不缺功能，缺的是**主线叙事与仪式感**。本轮重构以 CMB 的"定时精选事件感" + Hinge 的"解释优先"
+ Bumble 的"状态清晰"为骨架，全部落在既有页面结构内，不新增业务概念。
