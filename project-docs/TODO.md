# 待办任务清单

> 按优先级排序。完成项请移至 DEVELOPMENT_LOG 并勾选。  
> 最后更新：2026-06-29

---

## P0 — 工程与稳定性

### R0：本地跑通（不改业务逻辑）

- [ ] 执行 `database/import.bat` 或手动导入 init.sql
- [ ] 配置 `server/.env`（DB、JWT、微信占位）
- [ ] `cd server && npm install && npm run dev`
- [ ] 验证 `GET /api/common/health`
- [ ] 微信开发者工具导入 miniprogram，改 API_BASE_URL
- [ ] 记录所有报错到 DEVELOPMENT_LOG

### R1：修确定性 Bug（不影响 UI）

- [ ] `admin.js` 提现驳回 status 修正
- [ ] `user.js` cancel 与 marry_report 类型分离
- [ ] `admin.js` 隐私日志 auth_time 字段修正
- [ ] `user.js` like_circle_ids 赋值逻辑修正

### R3：安全加固（不影响 UI）

- [ ] 生产环境强制 JWT_SECRET，去除 dev 默认值
- [ ] 限制 CORS_ORIGIN
- [ ] `/api/wxpay/unified` 加 userAuth
- [ ] 支付回调强制验签（有 key 时）
- [ ] 文档提醒修改默认 admin 密码

---

## P1 — 配置化与匹配逻辑

### R2：配置化收敛（行为不变）

- [ ] 新建 `server/src/config/matchConfig.js` 抽出权重
- [ ] 实现 `GET /api/common/config`
- [ ] 前端 `app.onLaunch` 拉取 config
- [ ] 消除 `index.wxml` 硬编码 188（改绑 data）
- [ ] 更新 CONFIG_DESIGN 实施状态

### 匹配逻辑修正（已确认，需专项测试）

- [ ] 候选池：被匹配对象不要求 VIP
- [ ] 双向契合：scorePair 双向计算
- [ ] 对称写入 user_match_log
- [ ] **非 VIP 详情模糊展示 + 开通 VIP 引导**（Q1 已确认）
- [ ] **match-detail 字段收紧为最小集**：移除性别/城市/精确身高，年龄→年龄段，身高→区间档位（Q2 已确认）
- [ ] 匹配专项测试用例

### 身高区间（Q3 已确认，独立分支 `fix/height-range`）

- [ ] register 前端 `initHeights()` 改用 `HEIGHT_RANGE_OPTIONS`
- [ ] **新写分桶函数**（现有 `normalizeHeightRange` 不分桶，不可复用）
- [ ] 旧精确身高数据迁移脚本（新 patch，不改 init.sql）
- [ ] matchService `parseHeightCm` 改用区间中位数，避免老用户匹配分漂移

### R4：待评估小改

- [ ] 统一择偶 API（废弃重复路由）— 待评估

---

## P2 — 新功能 MVP

### 用户资料：外貌描述（v1 = 纯文本选填，不展示给对方、不打分）

- [ ] DB：`user.appearance_description` migration
- [ ] 后端：profile GET/PUT 支持字段（仅本人）+ 长度校验
- [ ] 后端：管理后台用户详情可读该字段；**匹配接口不返回给对方**
- [ ] 前端：profile 页增加 textarea（复用 match-setting 样式）
- [ ] ~~前端：match-detail 只读展示~~ **v1 不做**（Q4：不展示给匹配对象）
- [ ] safetyConfig：`appearanceMaxLen`、`appearanceVisibleToMatch=false`；matchConfig：`useAppearanceInMatch=false`

### 见面安全确认

- [ ] DB：`meet_report` 表设计 + migration
- [ ] 后端：CRUD API + 状态机
- [ ] 前端：`pages/meet-safety` 表单页
- [ ] 前端：`match-detail` 入口按钮
- [ ] 见面安全卡展示 + `onShareAppMessage`
- [ ] 前端：`pages/meet-safety-list` 历史记录
- [ ] profile 菜单增加入口
- [ ] safetyConfig 全套开关与文案

### 体验补缺（小 UI）

- [ ] marry-report / account-cancel 补 state-wrap
- [ ] index 动态匹配倒计时
- [ ] profile 显示 VIP 到期日

---

## P3 — 上线与后台完善

- [ ] 微信支付真环境密钥与回调
- [ ] 微信合法域名与 AppID
- [ ] admin 授权日志接 `/admin/privacy-logs`
- [ ] partner_withdraw status/remark schema 对齐
- [ ] ai_knowledge keywords 列或删 UI 字段
- [ ] 部署文档与审核材料核对

---

## P4 — 远期（默认不做）

- [ ] **外貌描述 v2：关键词 → LLM 生成用户画像**（已立项；启动前须过 5 项确认，见 MODULES/03 与 QUESTIONS 衍生需求；会改"v1 不接 LLM"决定）
- [ ] LLM 匹配理由（matchConfig.aiGenerateReason）
- [ ] 外貌参与匹配权重
- [ ] 行为推荐模型（路线 C）
- [ ] MBTI 轻量测试（需老板确认）

---

## 文档维护（每次变更）

- [ ] 更新 DEVELOPMENT_LOG.md
- [ ] 更新 DEVELOPMENT_PROGRESS.md
- [ ] 必要时更新 BOSS_IDEAS_CHECKLIST / REQUIREMENTS
