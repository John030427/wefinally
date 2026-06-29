# UI Review 文档

> 审计范围：`miniprogram/` 全部 15 页面 + `app.wxss`  
> 最后更新：2026-06-29  
> 原则：**复用已有 UI，不推翻重做**

---

## 一、架构说明

- **无自定义组件**：所有页面 `.json` 中 `usingComponents` 为空或未声明
- **设计系统**：全局样式在 `miniprogram/app.wxss`（280 行）
- **页面局部样式**：各页 `.wxss` 补充（如 `match-detail.wxss` 契合度卡）

---

## 二、当前 UI 风格

| 维度 | 规范 |
|------|------|
| 品牌色 | `#FF6B8A` / 渐变 `#ff6b8a → #ff8fa3` |
| 背景 | `#F8F4F5` |
| 卡片 | 白底、`16rpx` 圆角、浅阴影 |
| 按钮 | 主按钮粉色渐变胶囊；次按钮粉色描边 |
| 字体 | 正文 `28rpx`；标题 `30-40rpx`；大数字 `72-96rpx` |
| 调性 | 温暖、婚恋严肃、emoji 图标、无照片 |

---

## 三、全局样式清单（`app.wxss`）

| 类名 | 用途 |
|------|------|
| `.container` | 页面容器，32rpx 内边距 |
| `.page-title` / `.page-subtitle` | 页标题与副标题 |
| `.card` | 白色卡片容器 |
| `.btn-primary` / `.btn-secondary` | 主/次按钮（含 disabled） |
| `.form-label` / `.form-item` / `.picker-value` | 表单与下拉 |
| `.textarea-input` / `.char-counter` | 多行输入与字数统计 |
| `.state-wrap` / `.state-icon` / `.state-text` / `.state-btn` | 加载/空/错/无网 |
| `.tag` + `.tag-pink/gray/green/orange` | 标签 |
| `.progress-bar` / `.progress-fill` + 颜色修饰 | 进度条（三观契合度） |
| `.section-title` | 卡片内小节标题 |
| `.agreement-list` / `.checkbox` / `.agreement-label` | 协议勾选 |
| `.cooldown-banner` | 橙色冷却提示条 |
| `.safe-bottom` | 底部安全区 + 提交栏 |

---

## 四、已有页面清单

| 页面 | 路径 | 分类 | 数据接入 | 状态块 |
|------|------|------|----------|--------|
| 欢迎页 | `pages/welcome` | COMPLETE | 无 | 无 |
| 登录 | `pages/login` | COMPLETE | wx-login | 全 |
| 协议 | `pages/agreement` | COMPLETE | 本地 storage | 全 |
| 注册 | `pages/register` | COMPLETE | circles + register | 全 |
| 择偶配置 | `pages/match-setting` | COMPLETE | setting + cooldown | 全 |
| 首页(匹配) | `pages/index` | COMPLETE | profile + latest | 全+内联空 |
| 匹配记录 | `pages/match-list` | COMPLETE | match list | 全 |
| 匹配详情 | `pages/match-detail` | COMPLETE | match detail | 全 |
| VIP | `pages/vip` | COMPLETE | vip info + purchase | 全 |
| 我的 | `pages/profile` | COMPLETE | profile | 全 |
| 领证公示 | `pages/marry-stat` | DATA-CONNECTED | marry-stat | 全 |
| AI 客服 | `pages/chat` | COMPLETE | chat history/send | 部分 |
| 婚姻报备 | `pages/marry-report` | DATA-CONNECTED | marry-report | **无** |
| 账号注销 | `pages/account-cancel` | DATA-CONNECTED | cancel | **无** |
| 平台规则 | `pages/rules` | DATA-CONNECTED | rules + 本地兜底 | 仅 loading |

**tabBar**：匹配(`index`) / 记录(`match-list`) / 我的(`profile`)

---

## 五、页面局部组件模式（非独立组件，可复用）

| 模式 | 参考页面 | 结构 |
|------|----------|------|
| 用户卡片 | `profile.wxml` | `.user-card.card` + 文字头像 + tags |
| 菜单列表 | `profile.wxml` | `.menu-card` + `.menu-item` |
| 匹配元信息卡 | `match-detail.wxml` | `.meta-card` + `.profile-tags` |
| 契合度卡 | `match-detail.wxml` | `.compat-card` + 进度条 |
| 奔现对接卡 | `match-detail.wxml` | `.meet-card` + 客服链接 |
| 列表行 | `match-list.wxml` | `.list-item.card` |
| 通知说明卡 | `marry-report.wxss` | `.notice-card` 橙色 |
| 注销警告 | `account-cancel` | `.warn-card` + checkbox |
| 聊天气泡 | `chat.wxml` | `.msg-row` / `.msg-bubble` |

---

## 六、UI 复用分级

### 直接复用（复制结构即可）

- `.card`、`.btn-primary`、`.form-item`、`.textarea-input`、`.char-counter`
- `.state-wrap` 四态块
- `.list-item.card`（历史记录列表）
- `.meet-card`（安全确认入口扩展）
- `.compat-card` 进度条模式（可用于完成度展示）
- `.agreement` / `.checkbox`（安全提示确认勾选）

### 可小改

- `profile`：在 user-card 与 menu-card 之间插入外貌描述 `.card`
- `match-detail`：在 meet-card 增加「线下见面安全确认」按钮
- `index`：倒计时区改为动态（样式不变）
- `marry-report` / `account-cancel`：补 state-wrap 块

### 不建议改动

- `welcome` 自定义导航品牌页
- `login` / `agreement` / `register` 注册漏斗
- `match-setting` 冷却与三观表单（只复制模式，不改原卡）
- `vip` 支付页
- `app.json` tabBar
- `app.wxss` 全局色与圆角体系

---

## 七、新需求接入已有 UI

### 7.1 外貌描述 `appearance_description`

| 动作 | 位置 | 复用 |
|------|------|------|
| 自填编辑 | `pages/profile/profile.wxml` | `match-setting` 的 textarea + char-counter |
| 只读展示 | `pages/match-detail/match-detail.wxml` | `.meta-card` 或 `.meet-desc`  typography |
| 保存 | `profile.js` | 接通 `USER_PROFILE_UPDATE` |

**不新建页面。**

### 7.2 线下见面安全确认

| 动作 | 位置 | 复用 |
|------|------|------|
| 入口 | `match-detail` `.meet-card` 内 | 新增按钮，保留 AI 客服链接 |
| 表单页 | **新建** `pages/meet-safety` | `register` picker + `match-setting` textarea + `agreement` checkbox |
| 说明文案 | meet-safety 顶部 | `marry-report` `.notice-card` |
| 提交 | `.safe-bottom` + `.btn-primary` | 与 marry-report 一致 |

**定位**：官方客服对接奔现**之后**的附加层，文案用「线下见面安全确认」。

### 7.3 见面安全卡

| 动作 | 位置 | 复用 |
|------|------|------|
| 展示 | meet-safety 提交成功后 或 独立只读区 | `.card` + `match-detail` 字段行 |
| 转发 | `button open-type="share"` | 样式 `.btn-secondary`；需新增 `onShareAppMessage` |
| 字段 | 脱敏对象、时间、地点、说明、安全提示、小程序名、生成时间、卡编号 | 配置化见 CONFIG_DESIGN |

### 7.4 历史安全确认记录

| 动作 | 位置 | 复用 |
|------|------|------|
| 列表页 | **新建** `pages/meet-safety-list` 或 profile 菜单项 | `match-list` 整页结构 |
| 状态 | 列表行内 | `.tag-green` / `.tag-orange` |

### 7.5 状态横幅

- 冷却/待确认：`.cooldown-banner`
- 列表状态：`.tag-*`

---

## 八、静态 UI vs 已接数据

| 仅静态/弱数据 | 已完整接 API |
|---------------|--------------|
| welcome | login, register, match-setting, index, match-list, match-detail, vip, profile, chat |
| rules（有本地兜底） | marry-stat |
| marry-report/account-cancel（缺状态 UI） | — |

---

## 九、管理后台 UI（简述）

- `server/public/admin/index.html` — 单页 vanilla JS，粉色顶栏，侧栏导航
- `server/public/partner/index.html` — 同风格合伙人后台
- 新功能后台（见面报备审核）可后续在 admin 增菜单项，**不在小程序重做 UI**
