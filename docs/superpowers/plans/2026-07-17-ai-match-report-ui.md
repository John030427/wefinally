# AI 匹配报告 UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 匹配报告改造成温柔粉色高级感的分层移动端报告，同时保持现有接口、生成任务和状态逻辑不变。

**Architecture:** 在现有 `matchReport` 工具中增加纯展示模型转换函数，负责安全数组、总分可见性和建议序号；匹配详情页只消费展示模型。WXML 负责语义分区，WXSS 负责柔粉摘要、契合卡片、暖杏磨合区和编号建议的视觉层级。

**Tech Stack:** 微信小程序 WXML/WXSS/CommonJS、Node.js `assert` 自检、微信开发者工具。

## Global Constraints

- 实际工作目录固定为 `D:\wefinal\.worktrees\wefinally-ai-agent`，分支为 `feature/ai-agent-system`。
- 不修改后端接口、报告生成、轮询、重试、评分算法或 MiniMax 提示词。
- 不展示 `severity:medium` 等模型内部字段，不删除模型返回的用户可见内容。
- 兼容旧报告、缺失数组、缺失 `overall_score`、生成中、失败、禁用、过期和临时纯文本报告。
- 不新增图片资源、第三方组件、动画、折叠交互或其他页面重构。
- 工作树有大量用户改动；禁止 reset、clean、checkout 和覆盖无关改动。
- 按用户要求暂不执行 Git commit；计划中的每个任务以测试通过作为检查点。

## File Map

- Modify: `miniprogram/utils/matchReport.js` — 将原始 AI 报告规范化为稳定的页面展示模型。
- Modify: `miniprogram/pages/match-detail/match-detail.js` — 在详情加载时调用展示模型转换函数。
- Modify: `miniprogram/pages/match-detail/match-detail.wxml` — 分层报告语义结构。
- Modify: `miniprogram/pages/match-detail/match-detail.wxss` — 温柔粉色高级感样式。
- Modify: `server/selfcheck/ai-report-ui-lifecycle.js` — 展示模型行为与 WXML 结构回归。
- Modify: `server/selfcheck/cloudbase-migration.js` — 如现有 UI 合约依赖旧类名，仅作对应断言更新。
- Modify: `project-docs/DEVELOPMENT_LOG.md`、`project-docs/DEVELOPMENT_PROGRESS.md` — 记录实现与验证，不提交。

---

### Task 1: 构建稳定的 AI 报告展示模型

**Files:**
- Modify: `server/selfcheck/ai-report-ui-lifecycle.js`
- Modify: `miniprogram/utils/matchReport.js`
- Modify: `miniprogram/pages/match-detail/match-detail.js`

**Interfaces:**
- Consumes: 后端返回的 `detail.ai_report || detail.aiReport || null`。
- Produces: `buildAiReportView(report): null | { summary, hasScore, score, strengths, differences, communicationSuggestions, firstDateSuggestions, limitations }`。

- [ ] **Step 1: 写失败测试，定义展示模型行为**

在 `server/selfcheck/ai-report-ui-lifecycle.js` 引入新函数并增加以下断言：

```js
const { buildAiReportView } = require('../../miniprogram/utils/matchReport')

const reportView = buildAiReportView({
  overall_score: 88.4,
  summary: '现实基础较稳，适合继续了解。',
  strengths: [{ title: '同城', detail: '见面成本较低。' }],
  differences: [{ title: '情绪节奏', detail: '需要逐步适应。', severity: 'medium' }],
  communication_suggestions: ['先确认未来三年的城市安排。'],
  first_date_suggestions: ['选择安静的公共场所。'],
  data_limitations: ['报告仅基于已填写资料。']
})
assert.strictEqual(reportView.hasScore, true)
assert.strictEqual(reportView.score, 88)
assert.deepStrictEqual(reportView.communicationSuggestions[0], {
  order: '01',
  text: '先确认未来三年的城市安排。'
})
assert.strictEqual(reportView.differences[0].severity, undefined)
assert.strictEqual(buildAiReportView(null), null)
assert.strictEqual(buildAiReportView({ summary: '旧报告' }).hasScore, false)
```

- [ ] **Step 2: 运行测试并确认因函数缺失而失败**

Run: `node server/selfcheck/ai-report-ui-lifecycle.js`

Expected: FAIL，错误包含 `buildAiReportView is not a function`。

- [ ] **Step 3: 实现最小展示模型转换**

在 `miniprogram/utils/matchReport.js` 增加并导出：

```js
function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function numberedItems(items) {
  return safeArray(items).map((item, index) => ({
    order: String(index + 1).padStart(2, '0'),
    text: String(item || '').trim()
  })).filter((item) => item.text)
}

function buildAiReportView(report) {
  if (!report || typeof report !== 'object') return null
  const rawScore = Number(report.overall_score)
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0
  const titledItems = (items) => safeArray(items).map((item) => ({
    title: String(item && item.title || '').trim(),
    detail: String(item && item.detail || '').trim()
  })).filter((item) => item.title || item.detail)
  return {
    summary: String(report.summary || '').trim(),
    hasScore: Number.isFinite(rawScore) && rawScore > 0,
    score,
    strengths: titledItems(report.strengths),
    differences: titledItems(report.differences),
    communicationSuggestions: numberedItems(report.communication_suggestions),
    firstDateSuggestions: numberedItems(report.first_date_suggestions),
    limitations: numberedItems(report.data_limitations)
  }
}
```

- [ ] **Step 4: 在详情页接入展示模型**

将导入改为：

```js
const {
  buildFieldExplainItems,
  buildLocalMatchReport,
  buildAiReportView
} = require('../../utils/matchReport')
```

在构造 `normalized` 前增加：

```js
const aiReport = buildAiReportView(detail.ai_report || detail.aiReport || null)
```

并将 `normalized.aiReport` 赋值为 `aiReport`。不得修改 `normalizeAiReportState`、轮询或操作按钮逻辑。

- [ ] **Step 5: 运行展示模型测试**

Run: `node server/selfcheck/ai-report-ui-lifecycle.js`

Expected: PASS `ai report ui lifecycle`。

---

### Task 2: 重构成功报告的 WXML 信息层级

**Files:**
- Modify: `server/selfcheck/ai-report-ui-lifecycle.js`
- Modify: `miniprogram/pages/match-detail/match-detail.wxml`

**Interfaces:**
- Consumes: Task 1 的 `detail.aiReport` 展示模型。
- Produces: 稳定类名 `report-hero`、`report-section`、`report-point-card`、`report-advice-row`、`report-limitations`，供 Task 3 样式使用。

- [ ] **Step 1: 写失败的 WXML 合约测试**

在 `server/selfcheck/ai-report-ui-lifecycle.js` 增加：

```js
assert(view.includes('class="report-hero"'))
assert(view.includes('wx:if="{{detail.aiReport.hasScore}}"'))
assert(view.includes('class="report-point-card strength"'))
assert(view.includes('class="report-point-card difference"'))
assert(view.includes('{{item.order}}'))
assert(view.includes('class="report-limitations"'))
assert(!view.includes('{{item.severity}}'))
```

- [ ] **Step 2: 运行测试并确认因新结构缺失而失败**

Run: `node server/selfcheck/ai-report-ui-lifecycle.js`

Expected: FAIL 于 `report-hero` 断言。

- [ ] **Step 3: 替换成功状态报告结构**

将现有 `structured-report` 成功分支替换为以下语义结构，保留外层状态条件：

```xml
<view wx:if="{{detail.aiReportStatus === 'succeeded' && detail.aiReport}}" class="structured-report">
  <view class="report-hero">
    <view wx:if="{{detail.aiReport.hasScore}}" class="report-score-wrap">
      <text class="report-score">{{detail.aiReport.score}}</text>
      <text class="report-score-unit">分</text>
    </view>
    <view class="report-summary-wrap">
      <view class="report-eyebrow">核心结论</view>
      <view class="report-summary">{{detail.aiReport.summary}}</view>
    </view>
  </view>

  <view wx:if="{{detail.aiReport.strengths.length}}" class="report-section">
    <view class="report-section-head"><text class="report-section-icon">✓</text><text>契合点</text></view>
    <view wx:for="{{detail.aiReport.strengths}}" wx:key="index" class="report-point-card strength">
      <view class="report-point-title">{{item.title}}</view>
      <view class="report-point-detail">{{item.detail}}</view>
    </view>
  </view>

  <view wx:if="{{detail.aiReport.differences.length}}" class="report-section">
    <view class="report-section-head warm"><text class="report-section-icon">◇</text><text>需要磨合</text></view>
    <view wx:for="{{detail.aiReport.differences}}" wx:key="index" class="report-point-card difference">
      <view class="report-point-title">{{item.title}}</view>
      <view class="report-point-detail">{{item.detail}}</view>
    </view>
  </view>

  <view wx:if="{{detail.aiReport.communicationSuggestions.length}}" class="report-section">
    <view class="report-section-head"><text class="report-section-icon">💬</text><text>沟通建议</text></view>
    <view wx:for="{{detail.aiReport.communicationSuggestions}}" wx:key="order" class="report-advice-row">
      <text class="report-advice-order">{{item.order}}</text><text class="report-advice-text">{{item.text}}</text>
    </view>
  </view>

  <view wx:if="{{detail.aiReport.firstDateSuggestions.length}}" class="report-section">
    <view class="report-section-head"><text class="report-section-icon">♡</text><text>初次见面建议</text></view>
    <view wx:for="{{detail.aiReport.firstDateSuggestions}}" wx:key="order" class="report-advice-row">
      <text class="report-advice-order">{{item.order}}</text><text class="report-advice-text">{{item.text}}</text>
    </view>
  </view>

  <view wx:if="{{detail.aiReport.limitations.length}}" class="report-limitations">
    <view class="report-limitations-title">关于这份报告</view>
    <view wx:for="{{detail.aiReport.limitations}}" wx:key="order" class="report-limitations-text">{{item.text}}</view>
  </view>
</view>
```

- [ ] **Step 4: 优化报告标题但保持状态逻辑**

将标题左侧改为带标识与副标题的容器：

```xml
<view class="report-heading">
  <view class="report-heading-icon">AI</view>
  <view>
    <view class="meet-title report-title">AI匹配报告</view>
    <view class="report-subtitle">为你梳理值得了解与需要沟通的重点</view>
  </view>
</view>
```

右侧 `report-status` 的条件和文案保持不变。

- [ ] **Step 5: 运行 WXML 合约测试**

Run: `node server/selfcheck/ai-report-ui-lifecycle.js`

Expected: PASS。

---

### Task 3: 实现温柔粉色高级感样式

**Files:**
- Modify: `server/selfcheck/ai-report-ui-lifecycle.js`
- Modify: `miniprogram/pages/match-detail/match-detail.wxss`

**Interfaces:**
- Consumes: Task 2 定义的报告类名。
- Produces: 柔粉摘要、白色契合卡、暖杏磨合卡、编号建议和低强调局限提示。

- [ ] **Step 1: 写失败的样式合约测试**

在自检中读取 WXSS：

```js
const style = read('miniprogram/pages/match-detail/match-detail.wxss')
assert(style.includes('.report-hero'))
assert(style.includes('linear-gradient(135deg, #fff7fa'))
assert(style.includes('.report-point-card.strength'))
assert(style.includes('.report-point-card.difference'))
assert(style.includes('.report-advice-order'))
assert(style.includes('.report-limitations'))
```

- [ ] **Step 2: 运行测试并确认样式缺失**

Run: `node server/selfcheck/ai-report-ui-lifecycle.js`

Expected: FAIL 于 `.report-hero` 样式断言。

- [ ] **Step 3: 添加报告标题与摘要样式**

在 `match-detail.wxss` 的报告样式区域添加：

```css
.report-card { overflow: hidden; }
.report-heading { display: flex; align-items: center; gap: 16rpx; min-width: 0; }
.report-heading-icon { width: 56rpx; height: 56rpx; border-radius: 18rpx; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22rpx; font-weight: 700; background: linear-gradient(135deg, #ff8eaa, #ffb1c3); box-shadow: 0 8rpx 20rpx rgba(255, 107, 138, .2); }
.report-title { margin-bottom: 2rpx; color: #2f2930; }
.report-subtitle { color: #a18f96; font-size: 20rpx; line-height: 1.4; }
.structured-report { margin-top: 28rpx; }
.report-hero { display: flex; align-items: flex-start; gap: 24rpx; padding: 28rpx; border: 1rpx solid #ffe8ef; border-radius: 24rpx; background: linear-gradient(135deg, #fff7fa 0%, #fff1f5 100%); }
.report-score-wrap { flex-shrink: 0; min-width: 112rpx; padding-right: 24rpx; border-right: 1rpx solid rgba(235, 151, 174, .28); color: #d9577b; }
.report-score { font-size: 64rpx; line-height: 1; font-weight: 700; letter-spacing: -2rpx; }
.report-score-unit { margin-left: 4rpx; font-size: 22rpx; }
.report-summary-wrap { flex: 1; min-width: 0; }
.report-eyebrow { margin-bottom: 8rpx; color: #d96a88; font-size: 21rpx; font-weight: 600; letter-spacing: 2rpx; }
.report-summary { color: #4d4247; font-size: 25rpx; line-height: 1.78; }
```

- [ ] **Step 4: 添加分区、卡片、编号与局限样式**

```css
.report-section { margin-top: 36rpx; }
.report-section-head { display: flex; align-items: center; gap: 10rpx; margin-bottom: 16rpx; color: #42373c; font-size: 27rpx; font-weight: 650; }
.report-section-head.warm { color: #765448; }
.report-section-icon { display: inline-flex; align-items: center; justify-content: center; width: 38rpx; height: 38rpx; border-radius: 12rpx; color: #d9577b; background: #fff0f4; font-size: 21rpx; }
.report-point-card { margin-top: 12rpx; padding: 22rpx 24rpx; border-radius: 18rpx; }
.report-point-card.strength { border: 1rpx solid #ffe8ef; background: #fffafb; }
.report-point-card.difference { border: 1rpx solid #f7e7dd; background: #fff9f5; }
.report-point-title { margin-bottom: 8rpx; color: #4a3e43; font-size: 25rpx; font-weight: 600; }
.report-point-detail { color: #74676c; font-size: 23rpx; line-height: 1.7; }
.report-advice-row { display: flex; align-items: flex-start; gap: 18rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f5eaee; }
.report-advice-row:last-child { border-bottom: 0; }
.report-advice-order { flex-shrink: 0; color: #df7895; font-size: 22rpx; font-weight: 700; line-height: 1.7; }
.report-advice-text { flex: 1; color: #665a5f; font-size: 24rpx; line-height: 1.7; }
.report-limitations { margin-top: 34rpx; padding: 22rpx 24rpx; border-radius: 18rpx; background: #faf6f7; }
.report-limitations-title { margin-bottom: 10rpx; color: #88777e; font-size: 22rpx; font-weight: 600; }
.report-limitations-text { color: #a09297; font-size: 21rpx; line-height: 1.65; }
```

同时将成功报告不再使用的旧 `.local-report-title` 保留给临时报告分支，避免破坏兼容状态。

- [ ] **Step 5: 运行 UI 合约测试**

Run: `node server/selfcheck/ai-report-ui-lifecycle.js`

Expected: PASS。

---

### Task 4: 回归验证与视觉验收

**Files:**
- Modify: `project-docs/DEVELOPMENT_LOG.md`
- Modify: `project-docs/DEVELOPMENT_PROGRESS.md`

**Interfaces:**
- Consumes: Tasks 1–3 完成的页面。
- Produces: 可复现的自动化结果与微信开发者工具视觉确认记录。

- [ ] **Step 1: 运行语法与差异检查**

Run:

```powershell
node --check miniprogram/utils/matchReport.js
node --check miniprogram/pages/match-detail/match-detail.js
node --check server/selfcheck/ai-report-ui-lifecycle.js
git diff --check
```

Expected: 全部退出码为 0；允许既有 LF/CRLF warning，不允许 whitespace error。

- [ ] **Step 2: 运行 AI 报告和 Agent 回归**

Run:

```powershell
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:agent
```

Expected: 所有子检查输出 PASS，退出码为 0。

- [ ] **Step 3: 在微信开发者工具验证四种状态**

使用现有生产成功报告确认：

1. 总分存在时显示数字，摘要文本不拥挤。
2. 契合点、需要磨合、沟通建议和初次见面建议层级清晰。
3. 页面不出现 `severity:medium`。
4. 报告局限低强调但仍完整可读。
5. 将本地展示数据临时置为空数组时，对应区块不留下空白标题；验证后立即恢复，不提交测试数据改动。
6. 生成中、失败和临时纯文本分支的按钮与提示仍可见。

- [ ] **Step 4: 记录结果**

在开发日志中记录修改文件、红绿测试、视觉验收结果和未提交 Git；在进度文档勾选 AI 报告 UI 优化。不得记录用户私密报告正文、密钥或 openid。

- [ ] **Step 5: 最终复核工作树范围**

Run:

```powershell
git status --short -- miniprogram/utils/matchReport.js miniprogram/pages/match-detail/match-detail.js miniprogram/pages/match-detail/match-detail.wxml miniprogram/pages/match-detail/match-detail.wxss server/selfcheck/ai-report-ui-lifecycle.js project-docs/DEVELOPMENT_LOG.md project-docs/DEVELOPMENT_PROGRESS.md
```

Expected: 只列出本计划涉及文件及原本已存在的用户改动；不提交、不重置、不清理。
