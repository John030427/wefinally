# WeFinally UI Research 2026 — 六套视觉语言制作规范（SPEC）

> 本文是六套 prototype 的统一制作合同。每个方向的制作者必须全文遵守。
> 方法论来源：baoyu-design system-prompt（craft 标准）+ Anthropic frontend-design（bold aesthetic direction）+ UI_A~F 方向文档。
> **总原则：先确定鲜明 aesthetic direction，再写代码。禁止 generic AI slop。禁止同一页面骨架换颜色。**

## 1. 产品事实（不可违背）

WeFinally = 认真婚恋小程序：官方（霞姐团队）协调线下奔现，AI 辅助匹配与约会协调。

- 无私聊、无头像社交墙、无滑动匹配文化
- 霞姐要求「上手就能干」：3 秒内看懂"现在发生了什么、我该点哪"
- AI 是服务不是主角：AI 入口温柔收敛，但 **🤖 AI 生成内容标识必须醒目且不可移除**
- 一屏一个主动作；CTA 动词具体
- 状态词统一：`新匹配 / 待回应 / 协调中 / 已有安排 / 本次未成`
- 文案语气温柔直接不油腻：「先看看为什么适合，再决定要不要继续」✅，「恭喜！缘分来啦！」❌
- 触控目标 ≥ 44px；正文行高 ≥ 1.7（中文）

## 2. 统一 Mock 数据（六套共用同一批事实，只换表达方式）

**用户**：陈晓雯，29，深圳南山，产品经理。资料就绪度 92%。

**本次新匹配**：林亦辰，31，深圳福田，建筑师。
共同点：都是徒步爱好者（各走过 EBC 一段）、胶片相机用户（她 Contax T2 / 他 Nikon FM2）、周末日料党。
差异点：他偏宅家看片，她偏市集漫游——互补型节奏。
AI 匹配理由摘要：「你们的生活节奏像两条平行线，在周末交汇。」
AI 置信说明：基于双方资料与历史约会反馈综合判断，非打分制。

**首页其他信息**：
- 下一次介绍安排：本周六 14:30 · 南头古城 · 状态=协调中（对方已提议改到 15:00）
- 最近匹配精选：赵屹然（本次未成）、周牧遥（已有安排）
- AI 助手入口：有 1 条新建议（关于周六时间调整）

**New Match Reveal 场景**：陈晓雯刚收到系统通知，打开后看到林亦辰的介绍卡。两个动作：查看为什么适合（主）/ 稍后再看（次）。AI 标识必须在场。

## 3. 六方向 × 差异维度矩阵（每列至少命中 6 项，且不得与其他列雷同）

| 维度 | A Editorial | B Match File | C Date Pass | D Quiet Luxury | E Soft Brutalism | F AI Future |
|---|---|---|---|---|---|---|
| IA 信息架构 | 杂志目录式 Issue 结构 | 档案索引/抽屉结构 | 行程时间线结构 | 单封信件流 | 大块状态板 grid | signal 流（收敛图） |
| Typography | 大号衬线标题+细正文 | 打字机/标签体混排 | 票据等宽+无衬线 | 极少字重对比、大留白 | 超粗黑体全大写 | 变量字重、光标呼吸 |
| Spatial 空间 | 不对称栏格、细分隔线 | 表单格线、贴纸位 | 票券撕裂线/打孔 | 中轴对称、大量负空间 | 密铺块面、硬边 | 径向/轨道式布局 |
| Card morphology | 无卡片，用分隔线的文章区 | 卷宗袋/标签页卡 | 带撕边的票根 | 几乎无容器，纯排版 | 直角块+2px 描边 | 玻璃光晕面板 |
| CTA 形态 | 文字下划线链接式 | 印章按钮/签收条 | 登机牌式长条按钮 | 细边框幽灵钮+衬线 | 满宽黑底白字块 | 渐显 orb 按钮 |
| Iconography | 无图标，纯文字标记 | 手账线性小图标 | 票务 pictogram | 无图标 | 点阵/箭头字符 | 抽象信号点线 |
| Match reveal 隐喻 | 封面揭晓（Issue No.) | NEW FILE 建档盖章 | DATE PASS 出票 | 「这一周，为你」信笺 | MATCH FOUND. 状态闪现 | 两点信号收敛动画 |
| AI representation | 「编辑注」脚注体 | AI NOTE 旁注贴 | CONCIERGE 服务台 | 私人顾问一行字 | 条形加载/状态灯 | 呼吸 orb/收敛线 |
| Motion | 无动效，静态排版 | 盖章顿挫感（一次性） | 出票滑入（一次性） | 仅呼吸线 | 闪烁/扫描（克制） | 持续呼吸/收敛循环 |
| Density | 低密度大留白 | 中高密度表格化 | 中密度票据分区 | 极低密度 | 高密度块面 | 低密度聚焦 |

每套实现时：从上表逐行落实，**至少 6 个维度与其他套肉眼可辨**。

## 4. 通用工艺规范（hard rules）

1. **自包含单文件 HTML**：所有 CSS 内联 `<style>`；不依赖网络字体/CDN/图片；系统字体栈。
2. 字体栈示例（按方向选）：
   - 衬线中文：`Georgia, "Songti SC", "Noto Serif SC", "SimSun", serif`
   - 黑体中文：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
   - 等宽：`"SF Mono", "Cascadia Mono", Consolas, monospace`
   - 中文正文 line-height 1.7–1.8；`html lang="zh-CN"`
3. **反 AI slop 清单**（全部禁止）：紫色 SaaS 渐变背景；Inter/Roboto 当主字体；圆角卡片+左侧彩色描边；emoji 图标（🤖 AI 标识除外）；居中堆叠的通用 dashboard 卡片；假兼容分数；爱心泛滥装饰。
4. 布局用 flex/grid + gap；禁 inline-block 空白排版；`text-wrap: pretty` 用于长段落。
5. 页面画布：`body` 全 bleed，逻辑宽度恰好 390px（`max-width:390px; margin:0 auto;` 且内部按 390 设计）；页面高度自然增长（预计 1200–2200px）。
6. 图像策略：人物照片一律用**抽象占位**（色块/纹理/首字母 monogram/剪影），不用 SVG 画人脸，不引外部图片。占位要美，符合该方向质感。
7. 每个页面必须包含且仅包含一个主 CTA（动词具体）；次操作弱化。
8. 底部导航（Home 需要）：5 项以内文字导航，形态随方向变化（不必是传统 tab bar，但必须可辨识为导航）。
9. 动效：CSS-only；除 F 方向的持续呼吸外，其余只做一次性入场或 hover，不做无限循环装饰动画。
10. 写完自查 SPEC 第 1 节红线逐条过一遍。

## 5. 输出契约

- 目录：`designs/ui-research-2026/`
- Home 文件名：`home-{a-editorial|b-match-file|c-date-pass|d-quiet-luxury|e-soft-brutalism|f-ai-future}.html`
- Reveal 文件名：`reveal-{同上slug}.html`
- 每个文件头部注释：`<!-- WeFinally UI Research 2026 · Direction {X} · {screen} · 严禁用于正式小程序 -->`
- 截图由主线统一采集（390px 宽，自动裁掉底部空白），制作者不需截图。
