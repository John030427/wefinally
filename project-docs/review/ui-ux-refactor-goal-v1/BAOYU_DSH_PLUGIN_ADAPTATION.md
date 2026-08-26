# BAOYU_DSH_PLUGIN_ADAPTATION — baoyu design skill → DSH skill 改造记录

## 1. 来源定位

| 项 | 结果 |
|---|---|
| 本地已有 | `C:\Users\Administrator\.agents\skills\baoyu-design\`（DSH 会话技能，含 system-prompt.md 设计方法论 + built-in-skills + agents 产线脚本） |
| GitHub | baoyu design skill 即本机安装的同一体系（`baoyu-design`，设计产物=自包含 HTML 的方法论） |
| 结论 | 无需重新下载；按 DSH 技能规范做**包装改造**，而非搬运复制 |

## 2. 改造方案

baoyu-design 是**通用**设计方法论（HTML 产线）；WeFinally 需要的是**绑定本项目设计语言**的专属能力。
因此采用「包装 + 绑定」模式，新增 DSH skill：

**`wefinally-ui-design`**（已注册进本机 DSH 会话技能目录，刷新后即可被 `skill` 工具加载）

- 安装位置（DSH 运行时）：`C:\Users\Administrator\.agents\skills\wefinally-ui-design\SKILL.md`
- 版本化源码（仓库内）：`tools/dsh-skills/wefinally-ui-design/SKILL.md`（两处内容一致）

### SKILL.md 编码了什么

1. **产品红线**：认真婚恋/无私聊/无头像/AI 标识合规/不上手难度倒挂/小程序技术约束（WXML/WXSS/rpx/无 SVG 标签）
2. **Style A 设计语言 token**：与 `miniprogram/styles/tokens.wxss` 同源的颜色/字体/间距/圆角/阴影，保证任何会话产出的设计与代码一致
3. **体验主线**：被理解→被匹配→看懂为什么→决定→AI协调→真实见面
4. **页面清单映射**：8 个 P0 页面路径 + 各自设计要点
5. **工作流**：设计探索走 baoyu 产线（HTML 风格板/原型 + HTTP 预览 + 截图验证）；小程序落地规则（token 引用/组件抽取/旧类名兼容/JS 只动展示态）
6. **评审清单**：8 项一致性检查（3秒主线/唯一CTA/AI标识/图标混排/token/状态词/触控面积/不破坏业务）

### 与 DSH 插件体系的关系

- DSH 的 `dev_*` 插件产线适合**工具/UI面板/守护循环**类插件；设计方法论的正确形态是 **skill（提示词资产）**，与 baoyu-design 原生形态一致
- 因此选择 DSH skill 机制接入（`~/.agents/skills/`），而非强行做成工具插件；本会话技能目录已实际加载 `wefinally-ui-design`（见会话技能清单），满足"可被当前任务实际调用"

## 3. 本轮重构中的真实使用记录

| 阶段 | 使用方式 | 产出 |
|---|---|---|
| Stage 1 风格探索 | 按 baoyu 方法论（自包含 HTML、系统 CJK 字体栈、flex/grid+gap、无 emoji 装饰、每元素有存在理由）产出 4 方向风格板 | `designs/wefinally-uiux-refactor-goal-v1/Style Directions.html` |
| Stage 1 验证 | 按 baoyu「预览+截图检查」要求，用 DSH vision_html_screenshot 渲染截图检查渲染质量 | `style-board.png`（渲染正常：四方向手机框、色板、弹窗样机全部正确显示） |
| Stage 1 选型 | 风格板 + 加权选择矩阵 | 主方案 Style A、备选 Style C、D 局部借用 |
| Stage 2 落地 | 按 skill 内 token 表 1:1 写 `styles/tokens.wxss`；按"图标线性圆角、禁 emoji 混排"建立 icons.wxss | tokens.wxss / icons.wxss / app.wxss |
| Stage 3 页面 | 按 skill 的页面映射与文案语气逐页落地；每页过一遍 skill 的 8 项评审清单 | 8 个 P0 页面/模块 |
| Stage 5 自检 | 按 skill 评审清单复查（见 MANUAL_QA_CHECKLIST.md 设计走查部分） | 全项通过（列表逐条见 QA 文档） |

## 4. 后续维护

- 改设计语言：先改 `miniprogram/styles/tokens.wxss`，再同步 `tools/dsh-skills/wefinally-ui-design/SKILL.md` 与 `~/.agents/skills/` 副本（保持三处一致）
- 新页面设计：会话中直接让 DSH 加载 `wefinally-ui-design` skill，即获得红线+token+清单的完整约束
- 若未来 baoyu-design 升级方法论，只需重新对齐 SKILL.md 的"工作流（继承 baoyu-design）"一节
