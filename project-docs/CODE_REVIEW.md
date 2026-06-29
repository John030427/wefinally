# 代码 Review 文档

> 审计范围：miniprogram + server + database + public/admin|partner  
> 审计日期：2026-06-28 ~ 2026-06-29  
> 方法：主模型 + 3 个 Code Review sub-agent + Config Audit sub-agent

---

## 一、项目结构评估

| 维度 | 结论 |
|------|------|
| 目录清晰度 | **良好** — miniprogram/pages、server/src/routes|services|config 分层清楚 |
| 页面与路由 | **合理** — 15 页 + tabBar 三页；无自定义组件（页面级 UI） |
| 接口统一性 | **良好** — 前端 `utils/request.js` + `API_PATHS`；后端 Express 路由前缀统一 |
| 状态枚举 | **后端集中** — `server/src/config/constants.js`；前端无镜像枚举文件 |
| 后期维护 | **中等风险** — 前后端双份 constants、重复择偶 API、权重写死在 service |

---

## 二、Review 明细表

| 文件/模块 | 当前问题 | 影响 | 建议处理方式 | 是否立即修改 | 是否影响已有 UI |
|-----------|----------|------|--------------|--------------|-----------------|
| `server/src/routes/admin.js` 提现驳回 | 驳回时 `status` 置为 `1`（已结算）而非驳回态 | 合伙人资金/状态错误 | 改为正确驳回状态并回滚 balance | **是**（R1） | 否 |
| `server/src/routes/user.js` cancel | 使用 `marry_report.report_type=1`（与结婚报备同类型） | 报表语义混乱、审核流错误 | 新增 cancel 类型或独立表 | **是**（R1） | 否 |
| `server/src/routes/admin.js` 隐私日志 | `/admin/privacy-logs` 返回 `auth_time: row.create_time`（admin.js:503），但 `user_privacy_auth_log` 表**根本没有 `create_time` 列**（只有 `auth_time`，init.sql:212）→ 授权时间恒为 null/空 | 管理后台授权时间显示为空 | 改为 `row.auth_time` | **是**（R1） | 否 |
| `server/src/routes/user.js` match-settings | `like_circle_ids: like_circle_ids \|\| prefer_city` | 可能把城市字符串写入圈层字段 | 修正赋值逻辑 | **是**（R1） | 否 |
| `server/src/services/matchService.js` | 候选要求双方 VIP；仅单向写 `user_match_log` | 与已确认需求不符（B12/B13） | 放开候选 VIP；双向契合；对称写记录 | **是**（P1 专项） | 极小（非 VIP 可见提示） |
| `server/src/routes/user.js` + `match.js` | 两套择偶保存 API 重复 | 维护成本、行为可能不一致 | 保留一套，另一套 deprecated | 否（R4 待确认） | 否 |
| `miniprogram/pages/register/register.js` | 身高用 150-200cm 内联，未用 `HEIGHT_RANGE_OPTIONS` | 与 PRD 区间档位不一致 | 改用 constants 区间选项 + 旧数据迁移（新写分桶逻辑，`normalizeHeightRange` 不分桶） | **是（已确认 Q3：立即改 + 迁移）** | 极小 |
| `miniprogram/pages/index/index.js` | 下次匹配时间**已按周三/五动态计算**（`getNextMatchTime()`，index.js:39，页面加载时刷新一次），但**不是实时滚动倒计时**（不像 match-setting 的秒级冷却） | 体验略差（无实时跳秒） | 可选：复用 match-setting 倒计时模式做实时跳秒 | 否（P2） | 小改文案区 |
| `miniprogram/utils/constants.js` + `server/src/config/constants.js` | 188/30/7/20-300 双份维护 | 配置漂移 | R2 配置化 + `/api/common/config` | **是**（R2） | 否 |
| `miniprogram/pages/index/index.wxml` | 硬编码 `188元/30天` 未读 constants | 改价需改多处 | 绑定 data 或 config API | 是（R2） | 否 |
| `server/src/services/matchService.js` | 权重 30/25/15/12/8/6/4 写死在函数内 | 调参需改代码 | 抽到 `matchConfig.js` | 是（R2） | 否 |
| `miniprogram/utils/util.js` | 契合度颜色阈值 80/50 写死 | 与后端权重漂移 | 入 config | 是（R2） | 否 |
| `server/src/routes/common.js` + `rules.js` | 规则/协议文案三处重复 | 文案不一致 | 统一由 API 下发，弱化 LOCAL_RULES | 否（R2 后期） | 否 |
| `server/src/middleware/auth.js` | `JWT_SECRET` 默认 `dev_secret` | 生产安全风险 | 强制 env，启动时校验 | **是**（R3） | 否 |
| `server/src/app.js` | `CORS_ORIGIN=*` 默认 | 安全风险 | 生产限制域名 | **是**（R3） | 否 |
| `server/src/routes/wxpay.js` | `/unified` 无用户鉴权 | 可被滥用下单 | 加 userAuth | **是**（R3） | 否 |
| `server/src/routes/wxpay.js` | 无 API key 时跳过验签 | 伪造回调风险 | 生产强制验签 | **是**（R3） | 否 |
| `database/init.sql` | admin 默认密码种子 | 上线风险 | 部署后强制改密 | 文档提醒（R3） | 否 |
| `server/src/services/viewSimilarity.js` | Jaccard 字符 n-gram，非真 NLP | PRD 写语义分析；v1 已确认够用 | 保持；文档标注；后期可换 embedding | 否 | 否 |
| `server/src/services/aiChatService.js` | 关键词 KB，阈值 score>=3 | v1 已确认够用 | 保持；知识库可后台编辑 | 否 | 否 |
| `miniprogram/pages/profile/profile.js` | `USER_PROFILE_UPDATE` 未使用 | 资料无法编辑（含未来外貌） | 接通 update API | 否（P2 外貌） | 小改 profile 增区块 |
| `miniprogram/pages/marry-report` | 无 loading/error/no-network UI | 弱网体验差 | 复制 state-wrap 模式 | 否（P2） | 小改 |
| `miniprogram/pages/account-cancel` | 同上 | 弱网体验差 | 同上 | 否（P2） | 小改 |
| `miniprogram/pages/welcome` | 无网络状态块 | 弱网可点登录后失败 | 可选加 state-wrap | 否 | 小 |
| `server/public/admin` 授权日志页 | 未接 `/admin/privacy-logs` | 功能简化 | 接专用 API | 否（P3） | 否（后台） |
| `partner_withdraw` schema | UI 期望 status 0-3，表仅 0-1；无 remark 列 | 提现驳回展示不全 | migration 补丁 | 否（P3） | 否 |
| `ai_knowledge` | 后台 UI 有 keywords 字段，表无列 | 保存无效 | 删 UI 字段或加列 | 否（P3） | 否（后台） |
| `miniprogram` 全项目 | 无 `onShareAppMessage` | 安全卡转发需新增 | P2 见面安全模块实现 | 否（P2） | 新增能力 |

---

## 三、不能随便动的地方

| 模块 | 原因 |
|------|------|
| `pages/login` + `pages/agreement` + `pages/register` | 注册合规关键路径 |
| `pages/match-setting` 7 天冷却逻辑 | PRD 硬规则 |
| `app.json` tabBar 三页结构 | 导航架构 |
| `app.wxss` 全局设计令牌 | 全站 UI 一致性 |
| `pages/vip` 支付流程 | 资金安全 |
| `pages/account-cancel` 注销确认流 | 合规 |
| `database/init.sql` 已上线表结构 | 需 migration 而非直接改 init |
| `orderService` 188/94/94 分润计算 | 商业规则（改前需老板确认） |

---

## 四、可重构项（小步）

1. **R1**：4 处确定性 Bug（纯后端，零 UI 影响）
2. **R2**：constants 收敛 + matchConfig 骨架 + 前端读 config（行为不变）
3. **R3**：安全中间件与 env 校验
4. **匹配专项**：双向互配 + 非 VIP 候选（需测试用例）
5. **P2 功能**：外貌、见面安全 — 只增不改旧页核心布局

---

## 五、逻辑完成但 UI 未接 / 仅 UI 无逻辑

| 类型 | 项 |
|------|-----|
| 逻辑有、UI 未接 | `USER_PROFILE_UPDATE`；`/admin/privacy-logs` |
| UI 有、逻辑弱 | marry-report/account-cancel 缺 state 块 |
| 仅 UI | welcome 品牌页（符合预期） |

---

## 六、无用/废弃代码

| 项 | 说明 |
|----|------|
| `server/migrations/001_schema.sql` | 已标记 DEPRECATED，仅指向 init.sql |
| `profile.js` 未使用的 `post` import | 可清理（极小） |
| `match.js` `/start` 永远拒绝 | 故意 stub（cron only），保留并文档化 |

---

## 七、Sub-agent 审计记录

| Agent | 结论摘要 |
|-------|----------|
| Backend Review | MVP 功能齐全；Bug 4 处；安全 5 处 |
| Frontend Review | 15 页大部分 COMPLETE；register 身高、index 倒计时、profile 无编辑 |
| Database/Admin Review | 12 表齐全；admin/partner 调真实 API |
| Config Audit | 12/23 配置项缺失；双份 constants 漂移风险高 |

详见 `DEVELOPMENT_LOG.md`。
