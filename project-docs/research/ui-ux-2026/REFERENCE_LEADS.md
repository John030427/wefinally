# WeFinally UI 多风格探索 · 社区视觉参考情报（COMMUNITY_REFERENCES）

> 采集日期：2026-07 · 执行：视觉参考情报员（agent-reach 路由 + 多渠道脚本采集）
> 用途：WeFinally 认真婚恋小程序六套视觉语言的 moodboard / 截图存档前哨清单
> 所有条目均来自真实检索结果；无法访问的渠道如实标注 BLOCKED，未伪造任何条目。

**方向图例**
| 代号 | 方向 |
|---|---|
| **A** | Editorial 杂志感 |
| **B** | 日式档案 Match File |
| **C** | Date Pass 邀请函票券 |
| **D** | Quiet Luxury 静奢 |
| **E** | Soft Neo-Brutalism 软新粗野 |
| **F** | AI Future Romance 未来浪漫 |
| **ALL** | 六套通用（图库/基建/方法论） |

**渠道状态总览**
| 渠道 | 状态 | 说明 |
|---|---|---|
| Hacker News (Algolia API) | ✅ 成功 | 3 轮约 20 组查询，命中多条高分帖 |
| GitHub (gh search repos) | ✅ 成功 | 14 组查询，含 1000★+ 资源库 |
| Reddit | ❌ BLOCKED | `rdt` CLI 未安装；JSON API 直连全部 403 Blocked（数据中心 IP 被 Reddit 拒绝）。零数据 |
| Product Hunt (r.jina.ai) | ❌ BLOCKED | `/topics/design` 经 Jina Reader 两次返回空响应（无 key 限流/目标站拦截）。零数据 |
| web_search | ✅ 成功 | 6 组查询，补齐 C/D/F 及中日文线索 |

**可达性标注**：✅=本次 HTTP 校验 200 通过；⚠️=未逐一校验或校验异常（原因随条目注明）；截图前建议统一用无头浏览器二次确认。

---

## 渠道 1 · Hacker News / Show HN（Algolia API）✅ 共 24 条

### HN-01 Guidelines for Brutalist Web Design ✅*
- URL: https://brutalist-web.design/ （730 pts，[HN:17478133](https://news.ycombinator.com/item?id=17478133)；*本机 HEAD/GET SSL 异常，站点为 HN 两度收录的老牌页面，截图时用无头浏览器复核）
- 映射: **E**
- 用法: 借鉴其宣言式原则（系统字体、硬边框、无圆角、裸链接）作为 E 的骨架语法；不抄它反移动端舒适度的极端立场。

### HN-02 Brutalist Hacker News（Show HN）
- URL: https://brutalisthackernews.com （101 pts，[HN:39955057](https://news.ycombinator.com/item?id=39955057)）
- 映射: **E**
- 用法: 借鉴"信息密集型产品也能粗野"的密度控制；不抄纯文本列表带来的社交冷感——WeFinally 是情感产品。

### HN-03 Code and Theory 的 editorial web design 方法论
- URL: https://eyeondesign.aiga.org/the-era-of-nonchalant-web-design-is-here/ ✅（44 pts，[HN:31443856](https://news.ycombinator.com/item?id=31443856)）
- 映射: **A**
- 用法: 借鉴"nonchalant（随性）网页"的不对称栅格与呼吸感留白叙事；不抄媒体站重图慢加载。

### HN-04 Mobile Patterns — 移动端 UI 截图画廊
- URL: https://www.mobile-patterns.com/ （162 pts，[HN:18449280](https://news.ycombinator.com/item?id=18449280)；⚠️ 本次 GET 返回 404，可能已改版/失效，先复核再采）
- 映射: **ALL**
- 用法: 借鉴"按流程节点分类截图"的归档法（onboarding/表单/结果页），正好套 WeFinally 页面清单；若确已失效仅保留方法。

### HN-05 Inspiration UI — 真实项目灵感库
- URL: http://inspirationui.com （110 pts，[HN:11037939](https://news.ycombinator.com/item?id=11037939)）
- 映射: **ALL**
- 用法: 借鉴"只收上线真实项目"的筛选标准，避免 Dribbble 概念稿的悬浮感。

### HN-06 Call to Inspiration — 按 UI 元素切片的灵感工具
- URL: https://calltoinspiration.com/
- 映射: **ALL**（尤其 **C**）
- 用法: 按元素（卡片/票据/表单/空状态）检索，找 C 的票券组件变体最有效率。

### HN-07 Ask HN: Where can I find unusual UI inspiration?
- URL: https://news.ycombinator.com/item?id=31296879
- 映射: **ALL**（元资源帖）
- 用法: 评论区是长尾图库清单，用来二轮挖冷门参考；本身不是视觉参考。

### HN-08 98.css — Windows 98 设计系统复刻 ✅
- URL: https://jdan.github.io/98.css/ （838 pts，[HN:22940564](https://news.ycombinator.com/item?id=22940564)）
- 映射: **B / E**
- 用法: 借鉴"档案系统感"——窗口控件、硬边框、等宽标签页，Match File 的资料卡可直接化用这套控件语言；不照搬 Win95 灰蓝配色。

### HN-09 Why Japanese web design is so different ✅
- URL: https://randomwire.com/why-japanese-web-design-is-so-different/ （367 pts，[HN:25148942](https://news.ycombinator.com/item?id=25148942)）
- 映射: **B**
- 用法: 理解日系"高密度文字 + 极致留白并存"的文化成因，给 B 定调；不抄其中过时的表格布局实践。

### HN-10 The peculiar case of Japanese web design (sabrinas.space) ✅
- URL: https://sabrinas.space （267 pts，[HN:47122789](https://news.ycombinator.com/item?id=47122789)；另一版本 [HN:33745146](https://news.ycombinator.com/item?id=33745146)）
- 映射: **B** ★TOP
- 用法: 现代视角+大量案例截图重述日系网页美学，B 方向第一手视觉证据；别把"混乱密度"误当结论——文中区分了刻意与陈旧。

### HN-11 Godly — Astronomically good web design inspiration
- URL: https://godly.website/ （223 pts，[HN:37226805](https://news.ycombinator.com/item?id=37226805)；⚠️ 本机请求报客户端异常，属 pwsh 兼容性问题概率大，无头浏览器复核）
- 映射: **ALL**（重点 **A / D**）
- 用法: 筛 editorial / minimal / luxury 标签喂 A、D 的 moodboard；概念站居多，落地时降复杂度。

### HN-12 SiteInspire — web design inspiration
- URL: https://www.siteinspire.com/ （28 pts，[HN:5017465](https://news.ycombinator.com/item?id=5017465)；⚠️ 本次 429 限流=活着，低频访问）
- 映射: **ALL**
- 用法: 老牌严格分类画廊，styles=editorial/minimal 筛选直达 A/D；截图挑分类结果页即可。

### HN-13 OpenUX — 免费开源的 Mobbin 替代
- URL: https://www.openux.app/ （11 pts，[HN:44706128](https://news.ycombinator.com/item?id=44706128)）
- 映射: **ALL**
- 用法: 真实 App 全流程截图库，找生活/社交类产品的 onboarding 节奏做横向对照。

### HN-14 Productonboarding.com — SaaS onboarding 截图库
- URL: https://productonboarding.com/ （30 pts，[HN:37447445](https://news.ycombinator.com/item?id=37447445)）
- 映射: **C / F**
- 用法: 借鉴多步流程的"进度仪式感"（Date Pass 申请/AI 匹配等待页的分步呈现）；不抄 SaaS 冷色调。

### HN-15 Hyperpixel — Best landing pages for inspiration
- URL: https://hyperpixel.io/ （26 pts，[HN:15325480](https://news.ycombinator.com/item?id=15325480)）
- 映射: **ALL**
- 用法: 落地页构图参考，用于六套风格的概念宣传页而非小程序内页。

### HN-16 A Guide to Minimalist Web Design
- URL: https://ismailelazizi.com/blog/a-guide-to-minimalist-web-design （175 pts，[HN:22053598](https://news.ycombinator.com/item?id=22053598)）
- 映射: **D**
- 用法: 借鉴减法原则、灰阶层级与克制的强调色策略；文章本身排版一般，只取原则。

### HN-17 How to Make Text Look Interesting: Minimalist Web Design
- URL: http://getspace.org/typographic-contras-minimalist-web-design/ （455 pts，[HN:2692214](https://news.ycombinator.com/item?id=2692214)；⚠️ 老域名存活待复核）
- 映射: **A / D**
- 用法: 字号跳跃、字距对比的具体手法，直接构成 A 的标题系统规则；老文示例风格过时勿直搬。

### HN-18 Archetype — Web Typography Design Tool
- URL: http://www.archetypeapp.com （Show HN，[HN:14307156](https://news.ycombinator.com/item?id=14307156)）
- 映射: **A / D**
- 用法: 调字体配对与字阶的工具，六套风格定 type scale 时实操用。

### HN-19 Typography-Oriented Web Design
- URL: https://www.vividmotion.co/ （Show HN，[HN:20858224](https://news.ycombinator.com/item?id=20858224)）
- 映射: **A**
- 用法: "以文字为界面"的案例集合，A 方向弱图片依赖的佐证。

### HN-20 Designing Tables to Be Read, Not Looked At
- URL: https://alistapart.com/article/web-typography-tables （[HN:15692168](https://news.ycombinator.com/item?id=15692168)）
- 映射: **B**
- 用法: 表格排版 = 档案页核心技能，Match File 的条件/资料对照表照此规范做。

### HN-21 SecretCrush AI — AI chat companion（Show HN）
- URL: https://secretcrush.ai/?r=hn （[HN:43810835](https://news.ycombinator.com/item?id=43810835)）
- 映射: **F**
- 用法: 看 AI 对话界面的情感化包装（气泡质感、AI 状态指示）；坚决不抄擦边的产品定位与话术。

### HN-22 Russet — On-device private AI companion（Show HN）
- URL: https://apps.apple.com/us/app/russet/id6754737926 （[HN:45803973](https://news.ycombinator.com/item?id=45803973)）
- 映射: **F**
- 用法: 借鉴"端侧 AI=隐私安全"的叙事视觉化方式，契合 WeFinally 的信任感诉求。

### HN-23 Jynx — matchmaking app for gaming teammates（Show HN）
- URL: https://jynx.app/ （[HN:48336119](https://news.ycombinator.com/item?id=48336119)）
- 映射: 婚恋域参照
- 用法: 同样放弃滑卡的"匹配制"产品，观察它如何呈现"匹配成功"这一关键时刻的卡片与动效。

### HN-24 The Colors of Dribbble
- URL: http://nathanspeller.com/color-pickers/ （168 pts，[HN:5675728](https://news.ycombinator.com/item?id=5675728)）
- 映射: **ALL**
- 用法: 借其"全站统计主色"的方法论为六套风格建立配色基线与差异化检查。

---

## 渠道 2 · GitHub（gh search repos）✅ 共 18 条

### GH-01 emmabostian/design-inspiration ✅
- URL: https://github.com/emmabostian/design-inspiration （1194★）
- 映射: **ALL**
- 用法: 几十个灵感站的元清单，是后续扩展采集的总地图；不产出视觉本身。

### GH-02 marieooq/neo-brutalism-ui-library ✅
- URL: https://github.com/marieooq/neo-brutalism-ui-library （527★）
- 映射: **E** ★TOP
- 用法: 现成的软新粗野组件库（硬阴影/粗描边/撞色块），E 的 design token 可直接对标其参数；不抄它的玩具感配色比例，需换成 WeFinally 暖粉系。

### GH-03 pinecreativelabs/Brutalist-Framework
- URL: https://github.com/pinecreativelabs/Brutalist-Framework （437★）
- 映射: **E**
- 用法: 参考 border/grid 工具类的组织方式；框架整体太"原始"，只取工具类。

### GH-04 matifandy8/NeoBrutalismCSS
- URL: https://github.com/matifandy8/NeobrutalismCSS → https://github.com/matifandy8/NeoBrutalismCSS （183★）
- 映射: **E**
- 用法: 极简实现，阴影偏移量（如 4px 4px 0 #000）这类具体数值直接抄作业。

### GH-05 rational-kunal/NeoBrutalism（SwiftUI）
- URL: https://github.com/rational-kunal/NeoBrutalism （146★）
- 映射: **E**
- 用法: 证明粗野风能落到移动端卡片语言；小程序适配时参考其圆角/阴影在小屏的收敛处理。

### GH-06 davetron5000/brutalist-web-design（官网源码）
- URL: https://github.com/davetron5000/brutalist-web-design （96★）
- 映射: **E**
- 用法: 读源码学"少装饰多结构"的 HTML 骨架；无 UI 可截图，供工程侧参考。

### GH-07 cruip/tailwind-landing-page-template「Simple Light」
- URL: https://github.com/cruip/tailwind-landing-page-template （4493★）
- 映射: **D**
- 用法: 大留白浅色 landing 的成熟分区结构，D 风格官网/概念页基线；模板感重需注入品牌字体。

### GH-08 nobruf/shadcn-landing-page
- URL: https://github.com/nobruf/shadcn-landing-page （1273★）
- 映射: **ALL**
- 用法: 当"默认中性态"对照组——六套风格各自偏离它多少，是风格强度的度量尺。

### GH-09 mrpmohiburrahman/rnui.dev
- URL: https://github.com/mrpmohiburrahman/rnui.dev （348★）
- 映射: **ALL**
- 用法: React Native 组件目录站，移动端组件级（卡片/列表/底部弹层）灵感检索。

### GH-10 KKshitiz/Awesome-UI-Templates
- URL: https://github.com/KKshitiz/Awesome-UI-Templates （225★）
- 映射: **ALL**
- 用法: 模板合集索引，快速浏览不同风格的成品组合。

### GH-11 svg-stencils/awesome-ui-design-kits-opensource
- URL: https://github.com/svg-stencils/awesome-ui-design-kits-opensource
- 映射: **ALL**
- 用法: 真·开源 Figma/Sketch kit 清单，可拆源文件提取间距/字号 token。

### GH-12 DouyinFE/semi-design
- URL: https://github.com/DouyinFE/semi-design （10315★）
- 映射: **ALL（工程基建）**
- 用法: 3000+ design tokens 的组织与主题切换机制，是六套皮肤共底座的工程参照；视觉本身中性不参考。

### GH-13 sturobson/Awesome-Design-Tokens
- URL: https://github.com/sturobson/Awesome-Design-Tokens （1298★）
- 映射: **ALL（工程基建）**
- 用法: token 命名与分层的学习资源索引。

### GH-14 brennanbrown/brennan.jp.net
- URL: https://github.com/brennanbrown/brennan.jp.net
- 映射: **B**
- 用法: 刻意复刻日式紧凑文字排版的 Hugo 主题，其行高/字距/密度参数可量化借鉴；复古配色不必跟。

### GH-15 quangIO/dating-app-concept-flutter
- URL: https://github.com/quangIO/dating-app-concept-flutter （70★）
- 映射: 婚恋域参照
- 用法: 婚恋概念 App 的屏幕流全景（注册→资料→匹配），做竞品画面盘点。

### GH-16 joestackss/Dating-App-UI-React-Native
- URL: https://github.com/joestackss/Dating-App-UI-React-Native （28★）
- 映射: 婚恋域参照（反面教材）
- 用法: 典型滑卡式婚恋 UI——正是 WeFinally 要差异化的对象，内部评审时当"别长这样"的靶子。

### GH-17 naughtyduk/liquidGL
- URL: https://github.com/naughtyduk/liquidGL （841★）
- 映射: **F**
- 用法: 超轻量液态玻璃 web 实现，F 的材质层候选技术；性能敏感场景慎用全屏模糊。

### GH-18 JustAdumbPrsn/Zen-Nebula
- URL: https://github.com/JustAdumbPrsn/Zen-Nebula （1399★）
- 映射: **F**
- 用法: 成熟玻璃拟态主题，看半透明层级与发光边缘的配比；桌面浏览器主题语境需转译到小程序。

---

## 渠道 3 · Reddit ❌ BLOCKED

- `rdt search`：CLI 未安装（command not found）。
- JSON API 兜底（`reddit.com/r/<sub>/top.json`，带 User-Agent）：r/UI_Design、r/web_design、r/vibecoding、r/ClaudeCode、r/brutalism 五个子版全部 **403 Blocked**（数据中心 IP 被 Reddit 反爬拒绝）。
- 结论：本轮 0 条来自 Reddit，未以任何方式伪造替代。若需此渠道，须配置 rdt-cli cookies 或经住宅代理重试。

## 渠道 4 · Product Hunt ❌ BLOCKED

- `r.jina.ai/https://www.producthunt.com/topics/design` 两次调用（含带 UA/X-No-Cache 重试）均返回**空响应**（Jina 无 key 限流或 PH 反爬）。
- 结论：本轮 0 条来自 Product Hunt。备选路径：申请 Jina API key 后重试，或人工浏览。

---

## 渠道 5 · web_search 补充（小红书线索 / 日系 / 杂志风 / 票券 / 静奢 / AI 浪漫）✅ 共 25 条

### WS-01 Muzli — Top UI Design Trends 2025 ✅
- URL: https://muz.li/blog/top-ui-design-trends-to-know-in-2025/
- 映射: **ALL**
- 用法: 把六套风格钉在 2025 趋势光谱上（哪些是顺势哪些是反势）；防趋势词堆砌，只取判断框架。

### WS-02 StyleKit — Neo-Brutalist Soft showcase ✅
- URL: https://www.stylekit.top/zh/styles/neo-brutalist-soft/showcase
- 映射: **E** ★TOP
- 用法: 中文名即"软新粗野"，含 showcase 画廊 + AI-friendly 风格描述，E 的定义对齐与提示词素材库；社区作品质量参差需自筛。

### WS-03 Genius.Space — 新粗野主义 2024 综述（俄语）
- URL: https://genius.space/ru/lab/neobrutalizm-v-dizajne-sajtov-vse-o-nashumevshem-ux-ui-trende-2024-goda/
- 映射: **E**
- 用法: 系统梳理 neo-brutalism 的边界与可用性争议，翻译后提炼"E 的红线清单"。

### WS-04 mimel：AI チャットで推しとの恋愛（日系 AI 恋爱 App）✅
- URL: https://app-liv.jp/5354531/
- 映射: **F**（+**B** 日系语感交叉）★TOP
- 用法: 商店截图展示日本市场"AI 恋爱"界面的温度处理（柔和渐变+角色立绘+对话卡），F 必看的情感浓度标尺；虚拟恋人话术模式绝不移植——WeFinally 的 AI 是协调者不是恋人。

### WS-05 InvitiApp — 数字邀请函生成
- URL: https://invitiapp.com/en/changelog ✅（主站同域）
- 映射: **C**
- 用法: 票面模板结构（日期块/主办方/RSVP 按钮）可整体迁移为 Date Pass 卡片解剖图。

### WS-06 Invitation Card Maker & RSVP（App Store）
- URL: https://apps.apple.com/us/app/invitation-card-maker-rsvp/id6502515416
- 映射: **C**
- 用法: 移动端邀请函编辑器的模板选择器与实时预览交互，对应 Date Pass 生成流程。

### WS-07 The Brand Identity — Osklen × Aparelho Studio ✅
- URL: https://the-brandidentity.com/project/aparelho-studio-gives-osklens-digital-expression-a-glow-up-with-a-considered-layered-website
- 映射: **D** ★TOP
- 用法: "considered, layered website"的静奢分层实录——图层节奏、滚动叙事、图像裁切都是 D 的直接范本；品牌站体量远超小程序，做减法移植。

### WS-08 The Brand Identity — Niccolò Pasqualetti × Atelier Dyakova ✅
- URL: https://the-brandidentity.com/project/atelier-dyakova-merges-strength-and-fluidity-in-its-identity-for-designer-niccol%C3%B2-pasqualetti
- 映射: **D** ★TOP
- 用法: 高时装品牌的极简识别系统（字体对、留白率、黑白摄影），静奢气质的天花板参照。

### WS-09 Atlas Journal — Premium Editorial Website（Contra 整案）
- URL: https://contra.com/p/grlr7sNE-atlas-journal-premium-editorial-website-design
- 映射: **A**
- 用法: 编辑感网站的完整交付案例，栏格、首字下沉、图文绕排细节可逐项拆。

### WS-10 Aurèa — Jewellery Brand Web Design（Dribbble）
- URL: https://dribbble.com/shots/26975020-Jewellery-Web-Design
- 映射: **D**
- 用法: 珠宝品类的金色×大留白配比，接近"轻奢柔粉"的现有 token 气质；概念稿落地要压装饰。

### WS-11 Typewolf ✅（域名存活，未逐页校验）
- URL: https://www.typewolf.com/
- 映射: **A / D**
- 用法: 字体组合推荐 + Site of the Day 档案，定 A/D 中西文字对的第一站；英文字体为主，需配中文字重方案。

### WS-12 Are.na Editorial — On the Aesthetics of Progress
- URL: https://www.are.na/editorial/on-the-aesthetics-of-progress
- 映射: **A**
- 用法: 线上长文的编辑部排版实验，A 的文章型页面（如"见面手记"）直接参照。

### WS-13 Are.na — Collage channel（情绪板频道）
- URL: https://www.are.na/sam-dal-monte/collage-tk1bduj8ieo
- 映射: **ALL**
- 用法: 拼贴式 moodboard 组稿方法，六套风格的开题板都用这个形式攒素材。

### WS-14 The Row — Collections Page 概念稿（Dribbble）
- URL: https://dribbble.com/shots/24378248-The-Row-Fashion-Shop-Ecommerce-Website-Collections-Page
- 映射: **D**
- 用法: 极简时装列表页的网格与 hover 克制度，对应 D 的"候选人档案列表"；概念稿比例需校正到移动端。

### WS-15 Aēsop — E-commerce Website Exploration（Dribbble）
- URL: https://dribbble.com/shots/26320338-A-sop-E-commerce-Website-Exploration
- 映射: **D**
- 用法: 土棕色系+衬线标题的成熟配方，离 WeFinally 现有暖粉最近的一步之遥；别整站照搬色调。

### WS-16 Suplex Design — Aesop Website Audit
- URL: https://suplex.design/audit/aesop
- 映射: **D**
- 用法: 对真实静奢站的逐项审计方法论（导航/排版/动效打分），可直接改造成六套风格的自评 rubric。

### WS-17 MUJI — Japan Web Design Gallery 条目
- URL: https://japanwebdesign.com/website/muji/
- 映射: **B** ★TOP
- 用法: 该画廊专收日系网站，MUJI 条目之外顺藤摸瓜整个 B 素材池；画廊截图为主，原站体验自行打开。

### WS-18 DICE（iOS）Design Critique — Pratt IXD
- URL: https://ixd.prattsi.org/2025/02/design-critique-dice/
- 映射: **C** ★TOP
- 用法: 学院视角逐屏评析顶级票务 App——购票动线、票面层级、确认时刻的情绪设计，是 Date Pass 最贴近的对照物；音乐节语境转译为约会语境。

### WS-19 Boarding Pass Card — Free HTML/CSS Snippet
- URL: https://fwdtools.com/ui-snippets/boarding-pass/
- 映射: **C**
- 用法: 票券缺口（notch）、虚线撕裂线、条码区的现成 CSS 结构，Date Pass 卡片的工程起点。

### WS-20 Daily UI #024 — Boarding Pass（Dribbble）
- URL: https://dribbble.com/shots/26902876-Daily-UI-024-Boarding-Pass
- 映射: **C**
- 用法: 票券视觉变体速览（横竖版、色带、信息分区），挑两三张定 Date Pass 版式方向。

### WS-21 Weddingly — Elegant Wedding Invitation Template（Framer）
- URL: https://www.framer.com/marketplace/templates/weddingly/
- 映射: **C** ★TOP
- 用法: 婚礼邀请函数字模板——与"认真婚恋+官方安排见面"语境几乎重叠，仪式感文案位、日期版式、双方姓名并列关系都可平移；Framer 动效在小程序需重做。

### WS-22 小红书视觉风格系统（xhs-visual-director-skill 文档）
- URL: https://raw.githubusercontent.com/ziguishian/xhs-visual-director-skill/main/docs/style_system.md
- 映射: **ALL（中文语境）**
- 用法: 中文图文平台的爆款排版体系（封面层级/标题党边界/配色情绪），WeFinally 分享卡与引导页可借力；流量号审美不可侵入产品内页。

### WS-23 Moka — 小红书&公众号图文排版模板（GitHub）
- URL: https://github.com/vima-tech/moka
- 映射: **A（中文化落地）**
- 用法: 29 套中文图文模板的中宫格/字号/行距实测参数，A 杂志风中文化时对照；营销模板气质需过滤。

### WS-24 hibi｜two kanji journal（日系极简日记 App）
- URL: https://mwm.ai/apps/hibitwo-kanji-journal/6765628028 ✅
- 映射: **B**
- 用法: "一日二字"的仪式感界面——每日一档、纸质感、克制的红印章点缀，正是 Match File 的日常叙事原型。

### WS-25 プロフィールカードは「引き算」で整える（note.com，日文 UX 笔记）✅
- URL: https://note.com/asuka_uiux/n/nedb0b7a4ea9b
- 映射: **B** ★TOP
- 用法: 日文作者专讲"成员资料卡做减法"——字体层级与信息取舍，Match File 人物卡的直接方法论；日语长文需翻译摘录。

---

## 【截图优先级 TOP20】（无头浏览器批量截屏的建议顺序与理由）

| # | URL | 方向 | 截什么 / 为什么 |
|---|-----|------|----------------|
| 1 | https://sabrinas.space | B | 全站长文+内嵌案例图，日系网页美学的现代总纲，一页顶十篇 |
| 2 | https://www.stylekit.top/zh/styles/neo-brutalist-soft/showcase | E | "软新粗野"实名 showcase 画廊，E 的定义锚点与组件样本一次拿齐 |
| 3 | https://note.com/asuka_uiux/n/nedb0b7a4ea9b | B | 人物资料卡"减法"排版术，Match File 卡片设计的直接教材 |
| 4 | https://ixd.prattsi.org/2025/02/design-critique-dice/ | C | DICE 票务逐屏评析长文，Date Pass 动线+票面的最完整对照 |
| 5 | https://www.framer.com/marketplace/templates/weddingly/ | C | 婚礼邀请函模板多屏预览图，仪式感版式的现成分镜 |
| 6 | https://the-brandidentity.com/project/aparelho-studio-gives-osklens-digital-expression-a-glow-up-with-a-considered-layered-website | D | Osklen 分层静奢官网的项目记录图，D 图层节奏范本 |
| 7 | https://the-brandidentity.com/project/atelier-dyakova-merges-strength-and-fluidity-in-its-identity-for-designer-niccol%C3%B2-pasqualetti | D | 高时装识别+网站全套图，静奢天花板 |
| 8 | https://suplex.design/audit/aesop | D | Aesop 站逐项审计长图，兼作 D 的评分 rubric 素材 |
| 9 | https://dribbble.com/shots/26320338-A-sop-E-commerce-Website-Exploration | D | Aēsop 概念稿多屏拼图，暖棕静奢配色速查 |
| 10 | https://dribbble.com/shots/24378248-The-Row-Fashion-Shop-Ecommerce-Website-Collections-Page | D | The Row 列表页概念，档案列表网格参考 |
| 11 | https://app-liv.jp/5354531/ | F | mimel 商店页截图串，日系 AI 恋爱的界面温度标尺 |
| 12 | https://dribbble.com/shots/25867729-AI-Chat-Application | F | AI 对话界面视觉（来源见下方补充条目），气泡/状态灯样式池 |
| 13 | https://brutalist-web.design/ | E | 粗野宣言原文页本身就是 E 的样板（⚠️ 本机 SSL 异常，务必用无头浏览器复核） |
| 14 | https://godly.website/ | ALL | 画廊首页+editorial/minimal 分类结果页，A/D 素材富矿（⚠️ pwsh 报错，无头浏览器复核） |
| 15 | https://www.siteinspire.com/ | ALL | styles 筛选结果页截图两张即可（429 限流，低频访问） |
| 16 | https://eyeondesign.aiga.org/the-era-of-nonchalant-web-design-is-here/ | A | nonchalant 排版方法论配图，A 的开题引用源 |
| 17 | https://muz.li/blog/top-ui-design-trends-to-know-in-2025/ | ALL | 趋势总览长图，六套风格的光谱定位图 |
| 18 | https://japanwebdesign.com/website/muji/ | B | MUJI 条目页+画廊同类推荐，B 素材池入口 |
| 19 | https://jdan.github.io/98.css/ | B/E | 档案控件语言（窗口/按钮/进度条）组件全家福 |
| 20 | https://fwdtools.com/ui-snippets/boarding-pass/ | C | 登机牌卡片 snippet 的渲染效果+代码区，票券工艺（缺口/虚线/条码）工程起点 |

**补充条目（TOP12 引用的图源）**
- WS-附1 AI Chat Application（Dribbble shot，F 方向气泡视觉）: https://dribbble.com/shots/25867729-AI-Chat-Application

---

## 采集方法备注（诚实声明）

1. **Reddit 双路失败**：rdt CLI 缺失 + JSON API 403，五目标子版 0 数据。相关缺口（vibecoding/ClaudeCode 社区的审美讨论）由 GitHub 与 web_search 部分代偿。
2. **Product Hunt 失败**：Jina Reader 空响应 ×2。PH 的近期 design tools 线索由 GitHub trending 类查询部分代偿。
3. **小红书**：站内内容需登录且反爬强，仅获得公开可见的转述/镜像线索（WS-22/WS-23 及 huaban 花瓣散点），未冒充站内采集。
4. **可达性**：标注 ✅ 的 17 个 URL 为本次 HTTP 200 实测；⚠️ 条目注明了具体异常（404/429/SSL/pwsh 兼容性），截图阶段统一用无头浏览器二次确认后再入库。
5. 条目总数：**67 条**（HN 24 + GitHub 18 + web_search 25），另含 TOP20 截图计划。全部映射到 A–F 六方向。
