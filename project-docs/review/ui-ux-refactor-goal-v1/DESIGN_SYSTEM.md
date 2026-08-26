# DESIGN_SYSTEM — WeFinally Style A 轻奢柔粉

> 代码唯一出处：`miniprogram/styles/tokens.wxss`（token）、`miniprogram/styles/icons.wxss`（图标）、`miniprogram/app.wxss`（公共组件类）。
> 规则：页面样式禁止硬编码新颜色，一律 `var(--wf-*)` 引用；旧类名（card/btn-primary/tag/state-wrap…）全部保留兼容。

## 1. Color Tokens

| Token | 值 | 用途 |
|---|---|---|
| `--wf-primary` | `#E8637F` | 主玫瑰粉：CTA、关键强调 |
| `--wf-primary-strong` | `#D14D6B` | 深一档：按压/强调文字/分数 |
| `--wf-primary-soft` | `#F9DEE4` | 浅粉底：标签底、选中底 |
| `--wf-primary-soft-2` | `#FDF1F3` | 更浅粉：输入框底、图标底 |
| `--wf-primary-grad` | `135deg #E8637F→#F07A93` | 主按钮/主 CTA 渐变 |
| `--wf-bg` | `#FAF6F4` | 页面暖白底 |
| `--wf-card` | `#FFFFFF` | 卡片 |
| `--wf-text-main` | `#3A2E2E` | 主文字（暖黑，不用纯黑） |
| `--wf-text-sub` | `#8C7B7B` | 次要文字 |
| `--wf-text-hint` | `#B5A5A5` | 提示/占位 |
| `--wf-success` / `-soft` | `#4CAF87` / `#E6F5EE` | 成功、双方确认 |
| `--wf-warning` / `-soft` | `#E8A23D` / `#FBF1E1` | 待确认、邀请中 |
| `--wf-danger` / `-soft` | `#D9534F` / `#FBE9E8` | 错误、紧急（110） |
| `--wf-ai` / `--wf-ai-soft` | `#7B6CC8` / `#EFEBFA` | AI 专属紫（标识/等待态/AI 入口） |
| `--wf-border` | `#F0E4E4` | 分隔线/描边 |
| `--wf-mask` | `rgba(58,46,46,.55)` | 弹窗遮罩 |

## 2. Typography

| Token | 值 | 用途 |
|---|---|---|
| `--wf-fs-hero` | 44rpx | 首页倒计时等大数字场景 |
| `--wf-fs-h1` | 36rpx | 页面主标题 |
| `--wf-fs-h2` | 32rpx | 卡片标题/重要行 |
| `--wf-fs-body` | 28rpx | 正文 |
| `--wf-fs-caption` | 24rpx | 说明/次要 |
| `--wf-fs-tiny` | 20rpx | meta/kicker/时间 |

字重：标题 600–700，正文 400–500；全局 line-height 1.6，正文段落 1.7–1.8。

## 3. Spacing / Radius / Shadow

- 间距：`--wf-sp-1..7` = 8/16/24/32/40/48/64rpx（4/8 体系）
- 圆角：`--wf-radius-sm/md/lg/xl/pill` = 12/16/24/32/999rpx
- 阴影：`--wf-shadow-card`（卡片轻暖影）、`--wf-shadow-float`（弹窗）、`--wf-shadow-cta`（主按钮粉影）——全部低透明度暖色，禁止重投影

## 4. 图标体系（`styles/icons.wxss`）

- 26 个线性圆角图标（24×24、stroke 1.8、round cap/join），SVG data-URI + CSS mask 实现，`background-color: currentColor` 上色
- 用法：`<view class="wf-icon wf-icon-heart icon-sm icon-pink" />`；尺寸 `icon-sm(32)/默认(40)/icon-lg(48)/icon-xl(64)`
- 语义色类：`icon-pink/sub/hint/white/success/warning/danger/ai`
- 图标清单：heart/list/user/sparkle/calendar/shield/crown/gear/doc/bell/sos/arrow/close/check/clock/pin/wallet/chat/refresh/warn/edit/chart/book/gift/eye/home/logout
- 规则：图标与 emoji 禁止在同一层级混排；P0 页面已全部替换为 wf-icon

## 5. 公共组件（`miniprogram/components/`）

### state-view（统一状态视图）
- props: `type(loading|network|error|empty)`、`title`、`desc`、`actionText`、`icon`
- event: `bind:action`
- 已接入：index / match-list / match-detail / date-coordination / chat / profile

### ai-thinking（统一 AI 等待态）
- props: `text`（轮换文案，如"AI 正在整理回复…"）、`label`（"AI 生成中"）、`compact`（卡片内嵌行内版）
- 视觉：旋转光环 + 呼吸内芯 + 三点呼吸 + 🤖 AI 合规标识
- 原则：**结果到齐前稳定展示等待态，不吐半截内容**；失败走明确错误态 + 重试
- 已接入：chat 气泡生成中 / date-coordination 协调处理中 / match-detail 报告生成中

### new-match-modal（新匹配仪式弹窗）
- props: `visible`、`match{gender,ageText,city,matchDate,scoreText}`、`showDateCta`
- events: `bind:view`（查看匹配理由）/ `bind:later`（稍后再看）/ `bind:date`
- 视觉：呼吸光环心形视觉中心 + 「WeFinally 为你匹配到一位对象」+ 明确 CTA + AI 合规标识

## 6. 全局组件类（app.wxss）

- 卡片：`.card`
- 按钮：`.btn-primary`（渐变+粉影）/`.btn-secondary`/`.btn-sm`/`.btn-text`
- 标签：`.tag` + `tag-pink/gray/green/orange/ai/vip`
- 状态徽标：`.status-pill` + `is-success/is-warning/is-danger/is-ai/is-muted`（协调状态词统一用）
- AI 合规：`.ai-disclaimer` / `.ai-disclosure`（紫底胶囊，全局统一样式）
- 骨架屏：`.skeleton` + `.skeleton-line.w60/.w40` + `.skeleton-block`
- 表单：`.form-label(.required)/.form-hint/.picker-value/.textarea-input/.char-counter`
- 旧状态类：`.state-wrap/.state-icon/.state-text/.state-hint/.state-btn`（保留兼容未迁移页面）

## 7. 状态词汇表（全局统一）

新匹配 / 待回应（邀请中·等待对方） / 协调中 / 待确认 / 已有最终安排 / 本次未成 / 已转人工
—— 对应 date-coordination `statusTone`: warning(邀请) → ai(协调/确认) → success(安排) → muted(结束)。

## 8. AI 合规要求（不可违反）

1. 所有 AI 生成内容必须带 🤖 标识（`.ai-disclaimer` 全局样式）
2. AI 等待态必须持续可见直到结果完整返回
3. 失败必须给明确错误态 + 重试入口
4. AI 是服务不是主角：入口收敛为卡片行，不抢占主 CTA
