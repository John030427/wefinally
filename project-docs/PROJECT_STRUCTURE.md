# 项目目录结构说明

> 最后更新：2026-06-29  
> 真实代码根目录：`WeFinally婚恋小程序项目/WeFinally婚恋小程序项目/`

---

## 一、顶层结构

```
d:\wefinal\
├── We Finally AI婚恋奔现小程序｜完整可部署PRD....docx    # 老板 PRD（需求真源）
├── We Finally 小程序-Cursor纯指令极简终版Prompt....docx  # 老板开发指令
├── 老板早期想法-豆包记录与讨论.md                        # 背景参考，非执行依据
└── WeFinally婚恋小程序项目/
    └── WeFinally婚恋小程序项目/                          # ← 代码根目录
        ├── miniprogram/      # 微信小程序前端
        ├── server/           # Node.js 后端
        ├── database/         # MySQL Schema（单一真源）
        ├── docs/             # 部署/API/支付/审核
        ├── scripts/          # 启动脚本
        ├── project-docs/     # 交接与开发记录（本体系）
        └── README.md         # 原项目说明
```

---

## 二、miniprogram/（微信小程序）

```
miniprogram/
├── app.js              # 全局：API_BASE_URL、登录态、网络监听
├── app.json            # 15 页面路由 + tabBar(匹配/记录/我的)
├── app.wxss            # 全局设计系统（.card/.btn-primary/...）
├── project.config.json # 微信开发者工具配置（AppID 占位）
├── sitemap.json
├── utils/
│   ├── constants.js    # API 路径、选项数组、VIP/冷却/字数常量
│   ├── request.js      # 统一请求 + Bearer Token + 401 处理
│   └── util.js         # 工具：年龄、性别、契合度颜色、下次匹配时间
└── pages/
    ├── welcome/        # 品牌欢迎页
    ├── login/          # 微信一键登录
    ├── agreement/      # 三协议勾选
    ├── register/       # 极简注册（全下拉）
    ├── match-setting/  # 择偶 + 三观 + 7天冷却
    ├── index/          # tab：匹配首页
    ├── match-list/     # tab：匹配记录
    ├── match-detail/   # 匹配详情 + 契合度 + 奔现入口
    ├── vip/            # VIP 购买
    ├── profile/        # tab：我的
    ├── marry-stat/     # 领证数据公示
    ├── chat/           # AI 客服
    ├── marry-report/   # 婚姻报备
    ├── account-cancel/ # 账号注销
    └── rules/          # 平台规则/协议正文
```

**无 `components/` 目录** — 页面级 UI only。

---

## 三、server/（Node.js 后端）

```
server/
├── package.json
├── .env.example        # 环境变量模板
├── migrations/
│   └── 001_schema.sql  # DEPRECATED → 指向 database/init.sql
├── public/
│   ├── admin/index.html      # 超级管理后台 SPA
│   └── partner/
│       ├── index.html        # 合伙人后台 SPA
│       └── register.html     # 合伙人注册页
└── src/
    ├── app.js          # Express 入口、路由挂载、限流、静态资源、cron 启动
    ├── config/
    │   ├── constants.js    # 商业硬规则、状态枚举
    │   └── db.js           # MySQL 连接池
    ├── middleware/
    │   ├── auth.js     # JWT 签发/验证、user/partner/admin 守卫
    │   └── guard.js    # VIP、封禁、防抖、冷却天数计算
    ├── routes/
    │   ├── auth.js     # 微信登录、合伙人/管理员登录注册
    │   ├── user.js     # 注册、资料、择偶、报备、注销
    │   ├── match.js    # 择偶别名、匹配列表/详情
    │   ├── order.js    # VIP 订单（亦挂载 /api/vip）
    │   ├── chat.js     # AI 客服
    │   ├── report.js   # 婚姻报备（管理员）
    │   ├── common.js   # 圈层、健康检查、协议、规则
    │   ├── partner.js  # 合伙人 API
    │   ├── admin.js    # 管理员 API
    │   └── wxpay.js    # 微信支付
    ├── services/
    │   ├── matchService.js    # 批量匹配算法
    │   ├── orderService.js    # 订单创建/支付/幂等
    │   ├── wxpayService.js    # 微信统一下单
    │   └── aiChatService.js   # 知识库匹配客服
    ├── cron/
    │   ├── matchCron.js       # 周三/五 0:00 匹配
    │   ├── vipExpireCron.js   # VIP 过期
    │   └── settleCron.js      # T+7 分润结算
    └── utils/
        ├── viewSimilarity.js  # 三观 Jaccard
        ├── crypto.js          # bcrypt、MD5、订单号
        ├── response.js        # 统一响应格式
        └── apiFormat.js       # 字段别名
```

**规划新增**（尚未创建）：

- `config/matchConfig.js`
- `config/safetyConfig.js`
- `config/productConfig.js`
- `routes` 中 `GET /api/common/config`

---

## 四、database/

| 文件 | 作用 |
|------|------|
| `init.sql` | **Schema 单一真源**：**15 表**（含 `partner_user_audit_log`，见 init.sql:279）+ 50 圈层 + admin + 13 FAQ |
| `patch-002-partner-audit.sql` | 仅创建 `partner_user_audit_log`；该表 **init.sql 里已含**，故此补丁只对**升级旧库**有意义，全新 `init.sql` 导入后再跑此补丁是幂等空操作（`CREATE TABLE IF NOT EXISTS`） |
| `import.bat` | Windows 一键导入 init + patch |

> 📌 **核对说明（2026-06-29 代码复核）**：init.sql 的表注释只编号到「14.超级管理员」，`partner_user_audit_log` 接在 FAQ 种子之后、未编号，因此早期文档误记为「14 表 + 补丁新增第 15 表」。实际 init.sql 内有 15 张 `CREATE TABLE`，`partner_user_audit_log` 在 init.sql 与 patch-002 中**各有一份**（定义一致）。

### 主要数据表

| 表 | 用途 |
|----|------|
| occupation_circle | 50 职业圈层 |
| user | 用户主表 |
| user_match_setting | 择偶 + 三观 |
| partner | 合伙人 |
| user_order | VIP 订单分润 |
| user_match_log | 匹配记录 |
| marry_report | 婚姻报备 |
| system_stat | 领证公示数 |
| partner_withdraw | 提现 |
| user_privacy_auth_log | 协议授权 |
| ai_chat_log | 客服会话 |
| ai_knowledge | 知识库 |
| openid_blacklist | 封禁 |
| admin | 管理员 |
| partner_user_audit_log | 合伙人审核日志 |

**规划新增**：`meet_report`（见面安全确认）

---

## 五、docs/（原项目文档）

| 文件 | 内容 |
|------|------|
| API-REFERENCE.md | REST API 全集 |
| deploy-tencent.md | 腾讯云 + 宝塔部署 |
| wechat-pay.md | 微信支付对接 |
| wechat-review.md | 微信审核清单 |

---

## 六、project-docs/（交接体系）

见 `README_HANDOVER.md` 文档索引。

---

## 七、关键文件速查

| 需求 | 看哪个文件 |
|------|------------|
| 改 VIP 价格 | `server/src/config/constants.js` |
| 改匹配权重 | `matchService.js` → 未来 `matchConfig.js` |
| 改前端 API 地址 | `miniprogram/app.js` → `API_BASE_URL` |
| 改匹配 cron | `server/src/cron/matchCron.js` |
| 改全局 UI 样式 | `miniprogram/app.wxss` |
| 建表/迁移 | `database/init.sql` + 新 patch |
| 管理后台功能 | `server/public/admin/index.html` + `routes/admin.js` |

---

## 八、数据流概览

```
用户小程序 ──HTTPS──► Express /api/*
                         ├── auth (JWT)
                         ├── user/match/order/chat
                         └── MySQL (init.sql schema)

matchCron ──► matchService ──► user_match_log

管理员浏览器 ──► /admin/ ──► /api/admin/*
合伙人浏览器 ──► /partner/ ──► /api/partner/*
```
