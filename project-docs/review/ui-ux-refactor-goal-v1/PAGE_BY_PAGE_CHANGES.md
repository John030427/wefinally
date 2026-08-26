# PAGE_BY_PAGE_CHANGES — 逐页改动说明

> 原则：只动展示层（WXML/WXSS/展示态 JS），不动业务接口调用顺序、权限判断、安全逻辑、AI 合规文案。
> 所有颜色/间距来自 `styles/tokens.wxss`；图标来自 `styles/icons.wxss`。

## 1. 首页 `pages/index`（AI匹配首页）

**改了什么**
- 主线 Hero（journey-band）重设计：进度 kicker + 标题 + 描述 + 渐变 CTA，回答"我在哪一步、该做什么"
- 「下一次介绍」卡升级为视觉锚点：时钟图标 + 大字时间 + "每周 2 次"胶囊 + 绿点安心提示
- 新增 **新匹配仪式弹窗**（见 §2）
- VIP 卡：非 VIP 显示标题+说明+CTA；VIP 显示皇冠+到期日
- AI 恋爱助手入口：紫色 AI 图标位 + 陪伴感文案，收敛为服务卡
- 最近匹配：section header + 精选卡（标签/日期/信息/分数胶囊/"查看匹配理由"链接）；空态图标化
- 安全求助卡：盾形图标位 + 独立 110 红色按钮（保留原 callPolice 逻辑）
- 快捷入口 emoji → 线性图标（gear/doc/shield）
- QA 测试面板：从页面顶部显眼位置移到底部「内部测试工具」抽屉，**默认折叠**，与正式用户视图隔离

**JS 改动（展示态）**：新增 `newMatchVisible/newMatchInfo/qaPanelOpen` 状态、`maybeShowNewMatch/markMatchSeen/onNewMatchView/onNewMatchLater/toggleQaPanel`；`loadPage` 成功后调用 `maybeShowNewMatch`。接口调用顺序、鉴权、110 逻辑未动。

**新匹配判定（纯客户端）**：`latest.id !== wx.storage('wf_seen_match_id')` 时弹一次；点击任一按钮即记 seen。不发新请求、不改后端。

## 2. 新匹配结果弹窗 `components/new-match-modal`（新增）

- 仪式感：呼吸光环心形视觉中心、渐变卡片、弹入动画；文案按 plan（"WeFinally 为你匹配到一位对象 / 先看看为什么适合，再决定是否深入了解 / 这次匹配基于你们的画像、偏好与双向适配"）
- CTA：查看匹配理由（主）→ match-detail；稍后再看（次）；`showDateCta` 预留"发起第一次约会建议"
- 🤖 AI 合规标识常驻

## 3. 匹配记录页 `pages/match-list`

- 通知入口图标化 + 未读红点
- 新增列表顶部提示："每次匹配都经过双向条件筛选，点开先看匹配理由"
- 卡片化列表：类型标签 + **「新」徽标**（首条未 seen 的结果显示）+ 测试数据标签 + 分数标签 + 箭头
- 状态说明：匹配条目的"协调状态"（待回应/协调中等）依赖后端在列表接口返回逐条状态字段；当前接口无此字段，本轮以「新」标记 + 详情页状态为准，**未虚构状态**（避免误导）。已列为后续 P2 后端增强项
- QA 面板同样折叠隔离

## 4. 匹配详情页 `pages/match-detail`（含 AI 报告区）

- 状态头重设计：心形渐变视觉位 + "本期匹配 · 系统认真筛选" kicker + 类型/日期；锁定态改为图标+说明+CTA 卡
- 「为什么值得了解」结论卡：三组（匹配理由/需要确认/数据限制）改为左色条分组卡（绿/橙/灰），图标化标签
- **AI 报告可读性重构**：
  - 头部：标题 + 🤖 合规胶囊 + 状态徽标（生成中=紫/完成=绿）
  - 生成中/排队：接入 `ai-thinking` 统一等待态（不再只一行灰字），附"不影响后续操作"安心说明
  - 正文：结论 lead 卡 → 编号章节 → 分组浅底卡；行距 1.8、圆点行标；长内容块状化
  - 失败：红色失败卡（图标+标题+原因+重试按钮），不再只是一行字
- 感受反馈卡、算法细节折叠区、综合分/语义/字段拆解：全部 token 化，逻辑与绑定未动
- 底部行动区改为 sticky CTA 面板：主按钮「申请第一次约会」（心形图标+渐变），安全确认、约会后反馈、联系客服为次级行动；测试数据徽标保留

**绑定保全**：`detail.*`、`matchSummary`、`reportPresentation`、`feedback*`、`showAlgorithmDetails`、`dateFeedbackEligibility` 等全部保留，JS 未改。

## 5. 第一次约会 / AI 协调页 `pages/date-coordination`

- **顶部统一状态卡**：kicker + 状态词胶囊（按 `statusTone` 着色：邀请中=橙/协调=紫/已安排=绿/结束=灰）+ **四段步骤条（邀请→协调→确认→安排）**，用户一眼知道流程位置
- 协调处理中（computing_overlap processing/queued）：接入 `ai-thinking`（"AI 正在核对双方的时间、区域和活动…"），替代原静态文案卡
- 失败态/转人工卡保留并 token 化；邀请结果卡、双方协调情况（✓/⚠ 维度行）保留
- 表单：emoji 表单标签 → 线性图标标签（calendar/pin/heart/wallet/check/clock/sparkle）；choice-tag 选中态统一粉
- AI 协调员/人工客服支持卡：图标位（紫 AI / 粉人工）+ 箭头
- **JS 展示态新增**：`buildCoordinationDisplay` 增加 `statusTone/statusStepIndex/statusEnded`（纯展示推导，状态机 labels/分支逻辑未动）

## 6. AI 恋爱助手 `pages/love-advisor`（入口）

- Hero 重设计：AI 紫粉渐变 orb + 标题 + 双行副文案 + 🤖 合规胶囊 + 主 CTA
- 话题卡编号化（1/2/3）+ 箭头；底部安全承诺带盾形图标
- `askTopic/openConversation` 逻辑未动

## 7. AI 对话页 `pages/chat`（恋爱助手/约会协调/平台客服共用）

- 用户 ID 卡收纳为轻量工具行（标签+编号+复制按钮+说明），不再抢首屏注意力
- 欢迎提示 + 🤖 合规胶囊居中
- **生成中气泡**：原 gen-row 自绘态替换为 `ai-thinking` compact（同一气泡槽位，保持"不吐半截内容"原则）
- **失败气泡**：红色错误卡 + 「重新生成」按钮（原 retry 逻辑保留）
- 约会申请/修改预览卡（patch preview）、主责选择（primary resolution）、确认/取消按钮、转人工按钮：全部保留绑定，仅 token 化重绘
- 输入区：胶囊输入框 + 渐变发送按钮；`coordinatorReadOnly` 禁用逻辑保留
- 导航标题仍由 JS 按 agentType 动态设置（json 默认值改中性"AI 助手"）

## 8. 我的页 `pages/profile`

- 菜单从 13 项 emoji 平铺改为 **4 组**：资料与匹配 / 会员与订单 / 安全与信任 / 服务与设置；每项线性图标 + 标题 + 箭头
- 个人卡：渐变头像位 + 标签 + 「编辑资料」显性入口（图标+文字）+ 用户ID
- 资料就绪度卡前置强化：大百分比 + 渐变进度条 + 缺失项 + 双 CTA
- 合伙人工作台入口保留（图标化），全部状态文案未动
- 退出登录按钮图标化；注销入口保留在"服务与设置"

## 9. 全局

- `app.wxss`：token 化重写，旧类名全兼容；新增 status-pill/ai-disclaimer/skeleton/btn-sm/btn-text 等公共类
- `app.json`：导航栏 `#E8637F`、页面底 `#FAF6F4`、tabBar 选中色 `#E8637F`（与 Style A 对齐）
- 新增 `styles/tokens.wxss`、`styles/icons.wxss`、`components/state-view|ai-thinking|new-match-modal`
- 新增 `tools/check-wxml.js`（WXML 配对静态检查）

## 未在本轮范围内（如实说明）

- `date-feedback`（约会后反馈表单）、`welcome/login/register/match-setting/vip/orders/notifications/meet-safety*` 等页面未重排（P1/P2），但受惠于全局 token 与公共类
- 匹配列表逐条"协调状态"需要后端字段支持（P2 建议）
- 后台 admin/partner 视觉统一（P2，本轮未动）
