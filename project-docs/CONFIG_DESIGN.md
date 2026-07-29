# 配置化设计文档

> 最后更新：2026-06-29  
> **已确认方案**：后端 `server/src/config/*` 为单一真源 + `GET /api/common/config` 下发前端

---

## 一、为什么需要配置化

AI 写程序常见问题是把参数写死在页面/服务里，后期改价、改文案、改权重都要改多处代码。本项目要求：

- 不把数字、文案、状态、权重散落在页面文件中
- 不重复写同一个参数
- 状态枚举命名清晰
- 前端、后端、数据库字段命名统一

---

## 二、双运行时问题与方案

微信小程序与 Node.js **不能** `require` 同一份物理文件。

### 选定方案（用户已确认）

```
server/src/config/          ← 单一真源（编辑这里）
        ↓
GET /api/common/config      ← 启动时/定期拉取
        ↓
miniprogram 内存缓存        ← 运行时读取
        +
miniprogram/utils/constants.js  ← 离线兜底默认值（与真源保持同步）
```

### 现有可扩展钩子

`GET /api/common/agreements` 已在 `common.js:63-68` 返回部分 `config` 子对象，但**前端未消费**。建议新建或扩展为：

```
GET /api/common/config
```

返回：价格、冷却、匹配权重、安全开关、文案 key、分页默认值等（不含密钥）。

---

## 三、规划中的配置文件

| 文件 | 职责 |
|------|------|
| `server/src/config/constants.js` | 已有：VIP 价格、冷却、状态枚举、角色 |
| `server/src/config/productConfig.js` | 产品开关、文案 key、按钮文案 |
| `server/src/config/matchConfig.js` | 匹配权重、阈值、schedule、双向互配开关 |
| `server/src/config/safetyConfig.js` | 见面安全确认、安全卡、字数限制 |
| `server/src/config/appConfig.js` | 分页、rate limit、API 行为 |

前端镜像：`miniprogram/utils/constants.js`（仅兜底 + STORAGE_KEYS + API_PATHS）

> 注：用户示例中的 `/config/productConfig.js`（repo 根）在实现时落在 `server/src/config/`，避免小程序无法引用。

---

## 四、23 项配置清单

| # | 配置项 | 状态 | 当前位置 | 目标位置 |
|---|--------|------|----------|----------|
| 1 | 外貌描述最大字数 | **MISSING** | — | `safetyConfig.appearanceMaxLen`（建议 20–500） |
| 2 | 见面说明最大字数 | **MISSING** | — | `safetyConfig.meetNoteMaxLen` |
| 3 | 是否开启线下见面安全确认 | **MISSING** | — | `safetyConfig.meetSafetyEnabled` |
| 4 | 是否开启见面安全卡 | **MISSING** | — | `safetyConfig.safetyCardEnabled` |
| 5 | 是否强引导分享安全卡 | **MISSING** | — | `safetyConfig.encourageShareCard` |
| 6 | 安全提示文案 | **MISSING** | — | `safetyConfig.safetyTipsText` |
| 7 | 见面安全卡展示字段 | **MISSING** | — | `safetyConfig.cardDisplayFields[]` |
| 8 | 报备状态枚举 | **SCATTERED** | DB + `report.js` 魔法数 | `constants.MEET_REPORT_STATUS` |
| 9 | 报备可取消时间 | **MISSING** | — | `safetyConfig.cancelWindowHours` |
| 10 | 安全卡有效期 | **MISSING** | — | `safetyConfig.cardValidHours` |
| 11 | 按钮文案 | **SCATTERED** | 各页 WXML | `productConfig.buttons` |
| 12 | 页面提示文案 | **SCATTERED** | WXML + common.js | `productConfig.copy` + API |
| 13 | 匹配字段权重 | **SCATTERED** | `matchService.js:26-69` | `matchConfig.weights` |
| 14 | 价值观问题权重 | **SCATTERED** | 含在 view_sim 25 分 | `matchConfig.weights.viewSimilarity` |
| 15 | 外貌描述是否参与匹配 | **MISSING** | — | `matchConfig.useAppearanceInMatch`（**v1 确认 false**） |
| 15b | 外貌描述是否展示给匹配对象 | **MISSING** | — | `safetyConfig.appearanceVisibleToMatch`（**v1 确认 false**，仅本人+后台可见） |
| 16 | AI 是否生成匹配理由 | **MISSING** | — | `matchConfig.aiGenerateReason`（默认 false） |
| 17 | API 模型选择 | **MISSING** | — | `matchConfig.llmModel`（v1 空） |
| 18 | AI prompt 模板 | **MISSING** | — | `matchConfig.llmPromptTemplate` |
| 19 | 推荐列表数量 | **SCATTERED** | `match.js` pageSize=10 | `appConfig.defaultPageSize` |
| 20 | 匹配分阈值 | **MISSING** | 当前无最低分 cutoff | `matchConfig.minMatchScore` |
| 21 | 接口地址 | **SCATTERED** | `app.js` API_BASE_URL | env + `constants.API_PATHS` |
| 22 | 分页大小 | **SCATTERED** | 多路由 10/20/50 | `appConfig.pagination` |
| 23 | 后台筛选默认条件 | **SCATTERED** | `admin.js` 默认 page=1 | `appConfig.adminDefaults` |

### 已有（双份，需收敛）

| 项 | 前端 | 后端 |
|----|------|------|
| VIP 188 / 30 天 | `constants.js:48-49` | `constants.js:3-4` |
| 冷却 7 天 | `constants.js:47` | `constants.js:6` |
| 三观 20-300 字 | `constants.js:50-51` | `constants.js:32-33` |
| 匹配周三/五 | `constants.js:59-62` | `constants.js:8` + cron |
| 契合度 UI 阈值 80/50 | `util.js:39-58` | —（应下发或镜像） |

---

### 2026-06-29 决策对配置的影响

| 配置项 | v1 取值 | 决策来源 |
|--------|---------|----------|
| `safetyConfig.appearanceMaxLen` | 20–500 | Q4 |
| `matchConfig.useAppearanceInMatch` | `false` | Q4 |
| `safetyConfig.appearanceVisibleToMatch` | `false`（仅本人+后台） | Q4 / B-Q2 |
| `matchConfig.aiGenerateReason` / `llmModel` / `llmPromptTemplate` | v1 空/关；**外貌 LLM 画像属 v2** | 模块 03 v2 |
| 三观字数校验 | 选填；非空才校验 20–300 | B-Q1 |
| 身高 | 区间档位（`HEIGHT_RANGE_OPTIONS`）；旧精确值迁移 | Q3 |
| 非 VIP 匹配详情 | 模糊展示 + VIP 引导（`productConfig` 文案 + 前端 gate） | Q1 |
| 匹配详情展示字段 | 最小集（年龄段/学历/圈层/婚育/硬性/身高区间/契合度） | Q2 |

---

## 五、状态枚举统一命名

| 枚举 | 建议常量名 | 值 |
|------|------------|-----|
| 用户状态 | `USER_STATUS` | PENDING=0, NORMAL=1, BANNED=2, MARRIED=3 |
| 合伙人状态 | `PARTNER_STATUS` | FROZEN=0, ACTIVE=1, DISABLED=2 |
| 订单支付 | `ORDER_PAY_STATUS` | PENDING=0, PAID=1 |
| 订单结算 | `ORDER_SETTLE_STATUS` | UNSETTLED=0, SETTLED=1 |
| 婚姻报备类型 | `MARRY_REPORT_TYPE` | MARRY=1, DIVORCE_RESTORE=2, CANCEL=3（待增） |
| 审核状态 | `AUDIT_STATUS` | PENDING=0, APPROVED=1, REJECTED=2 |
| 见面报备状态 | `MEET_REPORT_STATUS` | DRAFT=0, CONFIRMED=1, CANCELLED=2, EXPIRED=3（规划） |
| 匹配批次 | `MATCH_TYPE` | WED='周三', FRI='周五' |

后端定义在 `server/src/config/constants.js`；通过 `/api/common/config` 下发前端只读副本。

---

## 六、数据库字段命名约定

| 逻辑 | DB 列名 | API JSON | 前端 |
|------|---------|----------|------|
| 外貌描述 | `appearance_description` | `appearanceDescription` | 同左或 snake |
| 见面报备 | `meet_report` 表 | `meetReport` | — |
| 三观自述 | `self_view_text` | `selfViewText` | `myValues`（现有，可 alias） |

新增字段优先 **snake_case** 入库，API 层用 `apiFormat.js` 做 camelCase 别名（已有先例）。

---

## 七、实施阶段

### R2（无行为变更）

1. 从 `matchService.js` 抽出权重到 `matchConfig.js`
2. 合并前后端 VIP/冷却/字数文档说明
3. 扩展 `GET /api/common/config` 返回现有 constants 子集
4. 前端 `app.onLaunch` 拉取 config 写入 `globalData.productConfig`

### P2（新功能）

1. 新增 `safetyConfig.js` 全部见面安全相关项
2. 新增 `appearanceMaxLen` 等
3. WXML 硬编码 188 改为 `{{config.vipPrice}}`

---

## 八、防漂移检查清单

改价/改规则时必查：

- [ ] `server/src/config/constants.js`
- [ ] `miniprogram/utils/constants.js`（兜底）
- [ ] `database/init.sql` 默认值（需 migration）
- [ ] `init.sql` FAQ 种子文案
- [ ] `common.js` agreements config 块
- [ ] `index.wxml` 等硬编码展示

---

## 九、不可配置项（PRD 死锁）

以下**不得**通过后台开关关闭（仅代码常量）：

- 用户端无图片上传
- 用户间无私聊
- 分润 50/50 比例
- 无自动续费

可变的是：文案、权重、字数、开关（安全功能）、阈值、分页等。
