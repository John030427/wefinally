# WeFinally 婚恋小程序

纯结婚导向严肃婚恋微信小程序，依托 50 大职业圈层合伙人风控、AI 定时精准匹配、三观文本语义契合度，仅支持官方一对一私密奔现。无头像、无用户私聊、无社交动态。

---

## 项目结构

```
WeFinally婚恋小程序项目/
├── miniprogram/          # 微信小程序原生前端
│   ├── pages/            # 页面（注册、匹配、会员、AI 客服等）
│   ├── utils/            # 请求封装、常量
│   ├── cloudfunctions/   # 微信云函数（login/api）
│   └── app.js / app.json
├── server/               # Node.js + Express 后端
│   ├── src/
│   │   ├── routes/       # API 路由（auth/user/match/order/admin/partner…）
│   │   ├── services/     # 匹配、订单、AI 客服等业务
│   │   ├── cron/         # 定时匹配、VIP 过期、T+7 结算
│   │   └── app.js
│   ├── public/
│   │   ├── admin/        # 超级管理后台 SPA
│   │   └── partner/      # 合伙人后台 SPA
│   └── migrations/       # 指向 database/init.sql 的说明
├── database/
│   └── init.sql          # 产品规格完整建表 + 50 圈层 + FAQ 种子数据
└── docs/
    ├── deploy-tencent.md # 腾讯云 + 宝塔部署
    ├── wechat-review.md  # 微信审核配置
    ├── wechat-pay.md     # 微信支付对接
    └── API-REFERENCE.md  # 完整 API 接口文档
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生微信小程序 |
| 小程序云端 | 微信云开发 CloudBase / 云函数 / 云数据库 |
| 本地后台 | Node.js 18+ / Express |
| 本地数据库 | MySQL 8.0 |
| 定时任务 | node-cron（内置） |
| 部署 | 腾讯云轻量 + 宝塔 + Nginx + PM2 |

---

## 核心商业规则（硬编码）

- VIP：**188 元 / 30 天**，无自动续费
- 匹配：每周三、周五 0:00 各 1 次，无手动刷新
- 择偶配置（含三观文本）：**7 天修改 1 次**
- 分润：平台 50% + 推广合伙人 50%，T+7 结算
- 无图片上传、无用户私聊、无社交 UGC
- 合伙人体系独立后台，小程序内完全隐藏

---

## 快速开始（本地开发）

### 0. 一键启动脚本（可选）

```bash
# Windows
scripts\start-dev.bat

# Linux / macOS
chmod +x scripts/start-dev.sh && ./scripts/start-dev.sh
```

### 1. 数据库

```bash
# Windows 一键导入（含补丁）
database\import.bat

# 或手动
mysql -u root -p < database/init.sql
# 再按文件名顺序追加 database/patch-00*.sql
```

### 2. 后端

```bash
cd server
cp .env.example .env   # 若无 example，参考 docs/deploy-tencent.md 创建 .env
npm install
npm run dev
```

服务默认：`http://localhost:3000`

- 健康检查：`GET /api/common/health`
- 超级管理后台：`http://localhost:3000/admin/`
- 合伙人后台：`http://localhost:3000/partner/`

### 3. 小程序（云开发体验版）

1. 微信开发者工具导入 `miniprogram/` 目录
2. 填写 AppID
3. 上传部署 `cloudfunctions/login` 和 `cloudfunctions/api`
4. 云开发环境使用 `cloud1-d4gy8l52g08bba326`
5. 体验版不再修改 API 基址，也不再依赖本地 `3000`

云开发导入与测试：

- [云开发迁移指南](./project-docs/CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md)
- [云开发体验版测试指南](./project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md)

---

## 管理后台

### 超级管理员

- 地址：`/admin/`
- 登录：`POST /api/auth/admin-login`
- 默认账号（init.sql）：`admin` / `admin123456`

功能：用户管理、合伙人审核、订单对账、提现审核、婚姻报备、公示数据、AI 知识库、客服会话、数据导出等。

### 合伙人

- 地址：`/partner/`
- 登录：`POST /api/auth/partner-login`
- 注册：`POST /api/auth/partner-register`（默认冻结，需管理员激活）
- 注册页：`http://localhost:3000/partner/register.html`
- 登录：`POST /api/auth/partner-login`（手机号 + 密码）

功能：推广数据看板、用户审核查看、分润订单、推广码/链接、提现申请。

---

## API 概览

| 前缀 | 说明 |
|------|------|
| `/api/auth/*` | 微信登录、注册、管理员/合伙人登录 |
| `/api/user/*` | 用户资料、择偶设置 |
| `/api/match/*` | 匹配列表、详情 |
| `/api/order/*` | 会员订单 |
| `/api/chat/*` | AI 客服 |
| `/api/partner/*` | 合伙人后台 API |
| `/api/admin/*` | 超级管理 API |
| `/api/wxpay/*` | 微信支付回调 |

统一响应格式：

```json
{ "code": 0, "message": "ok", "data": { } }
```

认证：请求头 `Authorization: Bearer <token>`

---

## 文档索引

- [腾讯云部署指南](./docs/deploy-tencent.md)
- [微信审核与配置清单](./docs/wechat-review.md)
- [微信支付对接指南](./docs/wechat-pay.md)

---

## 许可证与声明

本项目为 WeFinally 婚恋产品交付代码。上线前请完成企业资质、ICP 备案、微信类目审核及支付商户开通。
