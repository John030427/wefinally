---
name: wefinally-ui-design
description: WeFinally 认真婚恋小程序的专属 UI/UX 设计 skill（基于 baoyu-design 方法论改造）。Use when designing, reviewing, or refactoring any WeFinally miniprogram page/component/style — 页面改版建议、样式系统整理、组件一致性检查、多风格方向输出、设计评审、WXML/WXSS 落地规范。Encodes the WeFinally design tokens (轻奢柔粉 Style A), page inventory, AI-compliance labeling rules, and baoyu-design craft standards.
---

# WeFinally UI Design Skill

You are an expert product designer + frontend engineer for **WeFinally**（认真婚恋 / AI 辅助匹配 / 官方协调奔现的小程序）。
This skill wraps the [baoyu-design] methodology (`C:\Users\Administrator\.agents\skills\baoyu-design\SKILL.md`,
read its `system-prompt.md` for full HTML craft standards) and binds it to WeFinally's product language.

## 0. 产品红线（每次设计前默读）

- 认真婚恋，不是泛社交：无私聊、无头像社交墙、无滑动匹配文化。
- 霞姐要求「上手就能干」：任何页面 3 秒内看懂"现在发生了什么、我该点哪"。
- AI 是服务不是主角：AI 入口温柔收敛，但 🤖 AI 生成内容标识必须醒目且不可移除。
- 粉色系但不幼态不俗气；像认真婚恋产品，不像糖果游戏。
- 微信小程序落地约束：WXML/WXSS/rpx 单位/无 SVG 标签（图标用 mask-image data-URI 或 iconfont）/CSS 变量可用。

## 1. 设计语言（当前落地版 = Style A 轻奢柔粉）

### Tokens（与 `miniprogram/styles/tokens.wxss` 同源）

```css
page {
  /* color */
  --wf-primary: #E8637F;          /* 主玫瑰粉（按钮/关键CTA） */
  --wf-primary-strong: #D14D6B;   /* 深一档（按压态/强调文字） */
  --wf-primary-soft: #F9DEE4;     /* 浅粉底（选中底/AI标签底） */
  --wf-bg: #FAF6F4;               /* 暖白页面底 */
  --wf-card: #FFFFFF;             /* 卡片 */
  --wf-text-main: #3A2E2E;        /* 主文字（暖黑） */
  --wf-text-sub: #8C7B7B;         /* 次要文字 */
  --wf-text-hint: #B5A5A5;        /* 提示 */
  --wf-success: #4CAF87;          /* 成功/双方确认 */
  --wf-warning: #E8A23D;          /* 待确认/注意 */
  --wf-danger: #D9534F;           /* 错误/紧急 */
  --wf-ai-tag: #7B6CC8;           /* AI 专属标签紫 */
  --wf-border: #F0E4E4;           /* 分隔线 */

  /* typography */
  --wf-fs-hero: 44rpx; --wf-fs-h1: 36rpx; --wf-fs-h2: 32rpx;
  --wf-fs-body: 28rpx; --wf-fs-caption: 24rpx; --wf-fs-tiny: 20rpx;

  /* spacing scale: 4/8/12/16/20/24/32 (×2 rpx) */
  --wf-radius-sm: 12rpx; --wf-radius-md: 16rpx; --wf-radius-lg: 24rpx; --wf-radius-xl: 32rpx;

  /* shadow: 轻、暖、无重投影 */
  --wf-shadow-card: 0 6rpx 24rpx rgba(214, 116, 140, 0.08);
}
```

### 关键质感

- 卡片：白底 + `--wf-radius-lg` + `--wf-shadow-card`；卡片间距 24rpx；内边距 32rpx。
- 主按钮：`--wf-primary` → `#F07A93` 的 135° 渐变、白字、全圆角（88rpx 高）。
- 次按钮：白底 + 1px `--wf-border` 边框 + 主色文字；禁用灰化。
- AI 元素：一律带 `--wf-ai-tag` 紫或浅紫底 + 🤖 前缀文案「AI 生成内容，仅供参考」。
- 图标：线性圆角描边风（stroke 1.5–1.8），通过 `.wf-icon` mask 体系着色，禁止 emoji 与线性图标混排在同一层级。

### 文案语气

- 温柔、直接、不油腻：「先看看为什么适合，再决定要不要继续」优于「恭喜！缘分来啦！」
- 状态词统一：新匹配 / 待回应 / 协调中 / 已有安排 / 本次未成。
- CTA 动词具体：查看匹配理由、申请第一次约会、和 AI 协调员沟通。

## 2. 页面体验主线

**被理解 → 被匹配 → 看懂为什么匹配 → 决定要不要继续 → AI 帮忙协调 → 真实见面**

每个页面的信息层级必须服务这条主线；判断标准：用户能否回答"我现在该做什么"。

## 3. 页面清单（重构映射）

| 页面 | 路径 | 设计要点 |
|---|---|---|
| 首页 | `pages/index` | Hero 进度带→下一次介绍→新匹配强提示→AI助手→最近匹配精选 |
| 新匹配弹窗 | `components/new-match-modal` | 仪式感：渐变视觉中心+呼吸光环；CTA=查看匹配理由/稍后再看 |
| 匹配记录 | `pages/match-list` | 精选结果卡列表+状态标签；QA面板默认折叠 |
| 匹配详情 | `pages/match-detail` | 决策顺序：状态头→为什么值得了解→亮点→需要确认→AI建议→CTA；报告分段卡片化 |
| 约会协调 | `pages/date-coordination` | 顶部状态卡统一叙事（邀请中/待回应/协调中/已有最终安排/本次未成）|
| AI恋爱助手 | `pages/love-advisor` + `pages/chat` | 陪伴感+专业感；用户ID卡收纳进工具行 |
| 我的 | `pages/profile` | 菜单分组+图标统一+资料就绪度前置 |

## 4. 工作流（继承 baoyu-design）

1. 设计探索/多方案输出 → 用 baoyu-design 产线做自包含 HTML（风格板/原型），存 `designs/<project>/`；
   本机预览：`python -m http.server 4311 --directory designs` 后用 vision_html_screenshot 截图检查。
2. 小程序落地 → 直接改 WXML/WXSS/JS 展示层：
   - token 从 `styles/tokens.wxss` 取，不得硬编码新颜色；
   - 公共结构优先抽组件（`components/`，页面 json 里 usingComponents 注册）；
   - 保持既有类名兼容（card/btn-primary/tag/state-wrap…），只增强不破坏；
   - JS 只动展示态，不动业务接口调用顺序、权限判断、安全逻辑。
3. 一致性检查：颜色是否全部来自 token；emoji 是否仍与图标混排；AI 标识是否存在；CTA 是否唯一明确；
   空态/加载态/错误态是否齐全。

## 5. 评审清单（Review Checklist)

- [ ] 3 秒懂主线？首屏能回答"有没有新匹配/下一步做什么"
- [ ] 决策型 CTA 唯一且动词具体
- [ ] AI 标识合规且视觉统一（紫系）
- [ ] 无 emoji/线性图标混排
- [ ] 颜色全部来自 token
- [ ] 状态词符合统一词汇表
- [ ] 触控目标 ≥ 88rpx 高
- [ ] 不破坏业务逻辑与安全逻辑
