# 前端/UI 设计 Skill 方法论调研笔记

> 方法：gh CLI 抓取仓库原文（SKILL.md / README 全文）+ 本地安装文件直读 + web 检索交叉验证。所有引文均为一手来源原文；star 数为本次调研经 GitHub API 实时核实的时点数据。

## 1. Anthropic 官方 frontend-design（含 web-artifacts-builder）

**来源**：https://github.com/anthropics/skills/tree/main/skills/frontend-design ；配套 https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder （两个 SKILL.md 均已抓全文）

**核心主张与反对事项（原文）**：
- 角色设定强制差异化："Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's … take one real aesthetic risk you can justify."（以小工作室设计负责人的身份工作，给每个客户的视觉识别都不可被误认……并冒一次你能自圆其说的审美风险。）
- AI slop 校准清单——点名三种"默认脸"："(1) a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta accent; (2) a near-black background with a single bright acid-green or vermilion accent; (3) a broadsheet-style layout with hairline rules, zero border-radius…"（暖奶油底+高反差衬线+赤陶色；近黑底+酸性绿/朱红；报纸细线零圆角。三者对某些 brief 合法，但属默认而非选择。）
- 强制"鲜明方向先行"的两遍式流程：先写 compact token system——Color 4–6 个命名 hex、Type 两个以上字体角色、Layout 一句话+ASCII 线框、Signature 单一记忆点；再自审："if any part of it reads like the generic default you would produce for any similar page … revise that part, say what you changed and why"，确认非模板后才允许写代码。
- 克制原则："Spend your boldness in one place."（把大胆只花在一处。）并引香奈儿："出门前照镜子，摘掉一件饰品。"
- 反模板 hero："the hero is a thesis"；"a big number with a small label, supporting stats, and a gradient accent is the template answer"；01/02/03 编号只有当内容真是序列才许用。
- web-artifacts-builder 的反 slop 条款："VERY IMPORTANT: To avoid what is often referred to as 'AI slop', avoid using excessive centered layouts, purple gradients, uniform rounded corners, and Inter font."（避免过度居中布局、紫色渐变、统一圆角和 Inter 字体。）

**强项**：把方向先行落成可执行机制（两遍式 + token 四件套 + signature 元素），校准清单具体到色值。
**弱项**：纯提示词 guidance，无风格检索库、无确定性检测器，执行质量依赖模型自觉。
**WeFinally 适配**：**发散阶段主引擎**——用它批量产出互斥的 aesthetic direction 文档；轻奢柔粉 Style A 已定时走其"brief 优先"分支（"Where the brief pins down a visual direction, follow it exactly"）。

## 2. UI/UX Pro Max

**来源**：https://github.com/nextlevelbuilder/ui-ux-pro-max-skill （★121k；官网 uupm.cc；README 全文已抓取）

**核心主张/结构化能力（原文摘录）**：
- 自述："An AI skill that provides design intelligence for building professional UI/UX across multiple platforms and frameworks."
- v2.0 旗舰 Design System Generator：5 路并行检索（192 产品类型 / 79 可搜索风格其中 50 active / 192 行业色板 / 34 落地页 pattern / 74 字体配对）→ BM25 推理引擎 → 输出完整设计系统：Pattern + Style + Colors + Typography + Effects + **AVOID 反模式** + **Pre-delivery checklist**。
- 示例输出 AVOID 栏："Bright neon colors + Harsh animations + Dark mode + **AI purple/pink gradients**"；checklist 含 "No emojis as icons (use SVG)"、"Light mode: text contrast 4.5:1 minimum"、"prefers-reduced-motion respected"、375/768/1024/1440 四档响应式。
- 另有 119 条 UX Guidelines（韧性文本换行、chip `+n` 折叠、"Badge meaning cannot rely on color alone"）、22 个技术栈平台规范（React/Next.js/Flutter/SwiftUI/WPF 等）。Python 标准库离线运行。

**适用阶段**：给定产品类型直接产出成套 tokens 与交付检查单——是**收敛与规范化**工具，非发散工具（推荐本质是行业最佳实践平均数，个性上限受其 CSV 风格库约束）。
**强项**：检索式结构化知识 + 确定性 checklist + 跨栈落地规范最全。
**弱项**：输出趋同行业惯例，与"独特方向"目标相斥；数据集覆盖面决定天花板。
**WeFinally 适配**：**收敛阶段主力**——按"严肃婚恋/dating"产品类型跑一次生成基线设计系统，其 anti-patterns 用作柔粉方向的红线复核清单。

## 3. baoyu-design（JimLiu）

**来源**：https://github.com/JimLiu/baoyu-design （★3.6k，"Run Claude Design locally as an Agent Skill … self-contained HTML"）；父库 https://github.com/JimLiu/baoyu-skills （★25k）；本地已安装并直读 `C:\Users\Administrator\.agents\skills\baoyu-design\system-prompt.md` 与 `built-in-skills\frontend-design.md`。

**核心 craft 标准（本地原文摘录）**：
- 方向先行："Before coding, understand the context and commit to a BOLD aesthetic direction … Bold maximalism and refined minimalism both work — the key is intentionality, not intensity."（关键是有意图，而非强度。）
- 发散纪律："Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on the same choices across generations."（各次产出永不收敛到同一组选择。）
- 字体层级："Pair a distinctive display font with a refined body font"；禁 "overused font families (Inter, Roboto, Arial, Fraunces)"；CJK 专章：`PingFang SC / Noto Sans SC` 字体栈、中文行高 ≈1.7–1.8、按 `lang` 标签选字形。
- 留白与构图："Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density."
- 组件质感与工程规范：flex/grid + `gap` 显式间距、CSS 变量做 token 与明暗主题切换、"Mobile mockup hit targets should never be less than 44px"、幻灯文字不小于 24px。
- 禁止事项："Avoid AI slop tropes: … aggressive use of gradient backgrounds, emoji … containers with rounded corners and left-border accent color …"；"Do not add filler content … One thousand no's for every yes."（千次拒绝换一次允许——禁止凑数内容。）
- 流程协议：新项目必先 Ask Questions（大项目 10+ 问，必须确认视觉方向/参考 App/变体数量）；多变体用 design canvas 并排画板或 in-page variant toggle；一律 HTTP serve 后截图验证，禁 file:// 直开。

**强项**：唯一覆盖"提问→系统先行→多变体并排→浏览器验证"全链路的 skill，工程规范可直接落地代码。
**弱项**：面向 HTML 自包含原型而非小程序生产代码；系统提示词长，上下文开销大。
**WeFinally 适配**：**原型阶段主力**——design canvas 出多方案 hi-fi 再转 WXML/WXSS；其提问协议适合作视觉探索任务的启动器。

## 4. Impeccable 与 Anchor UI

### Impeccable（已验证 ✅）
**来源**：https://github.com/pbakaus/impeccable （★62.7k）；文档站 https://impeccable.style ；README 全文已抓取。作者 Paul Bakaus。
- 自述："Design guidance for AI coding agents. 1 skill, 23 commands, live browser iteration, and 59 deterministic detector rules for AI-generated frontend design."
- 谱系："Anthropic's frontend-design was the first widely-used design skill for Claude. Impeccable started from there."
- slop 描述："Every model trained on the same SaaS templates … Inter for everything, purple-to-blue gradients, cards nested in cards, gray text on colored backgrounds, the rounded-square icon tile above every heading."
- 机制：`/impeccable init` 写 PRODUCT.md + DESIGN.md 固化受众/品牌/anti-references/色彩字体组件；23 条动词化命令（bolder / quieter / distill / polish / critique / harden…）；59 条确定性检测规则可脱离 LLM 运行（`npx impeccable detect src/|URL`，CI 友好）；编辑 hook 在 Cursor 上可拦截坏写入。
- 明确反模式清单："Don't use overused fonts (Arial, Inter…) / gray text on colored backgrounds / pure black-gray (always tint) / cards nested in cards / bounce easing"。

**定位**：**复核阶段最强**——唯一提供机器可查反模式检测器的方案。
**WeFinally 适配**：定稿后 detect 挂 CI 防回潮；critique/polish 用于每轮原型复审。

### Anchor UI（存在性已验证 ⚠️ 性质需澄清）
**来源**：https://github.com/anchorui/ui （★13，早期项目）；文档 https://anchorui.com ；npm 包 @anchor-ui/react 自述："Anchor UI is a headless React component library that gives you full control over UX, accessibility, and styling."
**结论（如实记录）**：它是 headless React 组件库（Radix/Base UI 同类），**不是设计方法论 skill**。若上游目标文档把它与 Impeccable 并列引用为"skill"，该引用不成立。若原意是"锚定 aesthetic direction"的方法论，更接近的真实实践是 Ilm-Alan/frontend-design 的 "Eight aesthetic anchors"（Swiss / Industrial / Brutalist / Aurora Maximalism / Chaotic Maximalism / Retro-Futuristic / Organic / Lo-Fi；"Picking an anchor commits to those tokens, not to a vibe"——每个锚点锁定具体 CSS tokens 而非氛围）。Anchor UI 本身可作为原型转生产时的 headless 组件基座使用。

## 5. 生态扫描：值得借鉴的设计 skills（均经 GitHub API 核实）

| 项目 | 与"多风格探索/设计系统生成"的相关点 |
|---|---|
| anthropics/skills 官方其他 | theme-factory（10 套预制主题）、canvas-design（海报设计哲学+自带 20+ 字体库）、brand-guidelines、algorithmic-art |
| Leonxlnx/taste-skill（★80k） | "gives your AI good taste. stops the AI from generating boring, generic slop"——parametric dials、AI-tells bans、archetype overlays；中文版 Hayatelin/taste-skill-zh-CN |
| ComposioHQ/awesome-claude-skills（★73k） | 收录 uxKero/anydesign（图/URL/Figma → 结构化 design.md 设计系统还原）、rampstackco Brand Build Skills（59 skills 全生命周期）、wholiver/swiftui-design-skill（"反 AI Slop 六条铁律、五维评审"） |
| Ilm-Alan/frontend-design（★110） | 八锚点 token 锁定，见 §4 |
| dani-z/frontend-design-skill-benchmark（★24） | frontend-design skill vs baseline 质量评测（100% vs 28% pass rate）——可借鉴做 WeFinally 探索方案评测 |
| aladicf/better-web-ui（★24） | 面向 AI coding agent 的 web 前端设计 skill 库 |
| Shawnchee/frontend-god-mode（★15） | "Every famous frontend design skill, in one skill" 聚合思路 |
| bbylw/ui-ux-pro-max-skill-cn（★1.3k） | Pro Max 官方中文教程，中文团队接入成本低 |

## 6. 组合策略：发散 → 收敛 → 原型 → 复核 流水线

1. **发散 = Anthropic frontend-design × baoyu 方向纪律 × 八锚点菜单**。先按 baoyu 提问协议锁定范围/参考/变体数；然后为每个候选方向写官方两遍式的 token 系统（4–6 色、双字体角色、ASCII 布局、signature 元素），用八锚点强制 N 个方向彼此互斥（"NEVER converge on the same choices across generations"）。产出物：N 份互斥 aesthetic direction 文档。
2. **收敛 = UI/UX Pro Max**。以"严肃婚恋/交友"产品类型跑 Design System Generator 得行业基线（pattern/风格/色板/字配对/AVOID/checklist），与发散结果交叉评审：存活方向必须既带 signature 又不踩行业红线（4.5:1 对比度、44px 触控、reduced-motion）；柔粉 Style A 作为 brief 约束优先于一切推荐（官方原话：brief 优先）。
3. **原型 = baoyu-design**。胜出方向进 design canvas 多画板并排 hi-fi，in-page variant toggle 支持参数微调对比；遵循其工程规范（gap 布局、CSS 变量 token、CJK 行高 1.7–1.8）；HTTP serve + 截图验证后再人工评审。需要生产级组件时由 Anchor UI 类 headless 库承接（可访问性内建、样式自由度不受损）。
4. **复核 = Impeccable + Pro Max checklist 双门禁**。init 把定稿方向固化进 DESIGN.md；critique → polish 两轮；`npx impeccable detect` 的 59 条确定性规则挂 CI 防回潮，叠加 Pro Max pre-delivery checklist；最后用官方自审问题终审——"does this read like the generic default?"（这看起来像通用默认产物吗？）

一句话总结：**官方 skill 与八锚点负责"不同"，Pro Max 负责"对"，baoyu 负责"看得见摸得着"，Impeccable 负责"不变丑"。**

---
*调研执行说明：anthropics/skills 两个 SKILL.md、pbakaus/impeccable README、nextlevelbuilder README、Ilm-Alan README 均为 gh API 抓取全文后核对；baoyu-design 为本地安装文件直读；anchorui/ui 经 npm README + GitHub repo 双重核实。未发现名为 "Anchor UI" 的设计方法论 skill，已如实记录。*
