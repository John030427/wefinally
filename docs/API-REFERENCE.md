# WeFinally API 接口参考

> 基础地址：`http://localhost:3000`（生产环境替换为实际域名）  
> 统一响应：`{ code: 0, message: "ok", data: ... }`，`code !== 0` 为失败

---

## 认证说明

| 角色 | Header | 获取方式 |
|------|--------|----------|
| 小程序用户 | `Authorization: Bearer <token>` | `POST /api/auth/wx-login` |
| 合伙人 | `Authorization: Bearer <token>` | `POST /api/auth/partner-login` |
| 管理员 | `Authorization: Bearer <token>` | `POST /api/auth/admin-login` |

---

## 小程序端

### 认证 / 注册

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/wx-login` | 微信 code 换 token，`{ code }` |
| POST | `/api/user/register` | 注册，`promote_code`、基础资料、三观文本 |
| GET | `/api/user/profile` | 当前用户资料 |
| PUT | `/api/user/profile` | 更新资料 |
| POST | `/api/user/marry-report` | 结婚报备（待审核） |
| POST | `/api/user/cancel` | 账号注销申请 |

### 匹配

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/api/match/setting` | 择偶配置（7 天冷却） |
| GET | `/api/match/setting/cooldown` | 冷却剩余时间 |
| GET | `/api/match/list` | 历史匹配列表 |
| GET | `/api/match/detail/:id` | 匹配详情（含三观契合度） |
| GET | `/api/match/latest` | 最近一次匹配（首页） |

### VIP / 订单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vip/info` | VIP 状态 |
| POST | `/api/vip/purchase` | 创建 VIP 订单；开发环境无支付配置时自动 Mock 支付 |
| GET | `/api/order/status/:orderNo` | 订单支付状态 |
| GET | `/api/order/list` | 用户订单列表 |

### AI 客服

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat/send` | 发送消息 |
| GET | `/api/chat/history` | 对话历史 |

### 公共

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/common/circles` | 职业圈层列表 |
| GET | `/api/common/agreements` | 协议文案 |
| GET | `/api/common/stats` | 平台公示数据（结婚对数等） |
| GET | `/api/platform/rules` | 平台规则 |
| GET | `/api/platform/marry-stat` | 结婚统计 |

---

## 微信支付

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/wxpay/notify` | 微信支付回调（XML） |
| POST | `/api/wxpay/mock-pay` | **仅开发环境** 手动 Mock 支付 `{ order_no }` |

---

## 合伙人后台 `/api/partner/*`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/partner/dashboard` | 看板数据 |
| GET | `/api/partner/users` | 推广用户列表，`?status=0` 待审核 |
| PUT | `/api/partner/users/:id/audit` | 审核：`{ action: "view"\|"approve"\|"reject", reason }` |
| GET | `/api/partner/orders` | 分润订单 |
| GET | `/api/partner/withdrawals` | 提现记录 |
| POST | `/api/partner/withdraw` | 申请提现 `{ amount }` |
| GET | `/api/partner/promote-tools` | 推广码与链接 |

审核通过：用户 `status` 0→1；驳回：0→2（封号），并写入 `partner_user_audit_log`。

---

## 管理后台 `/api/admin/*`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/dashboard` | 数据看板 |
| GET | `/api/admin/users` | 用户列表（含字段别名 `nickname`/`vip_expire_at`） |
| GET | `/api/admin/users/:id` | 用户详情 + `agreements` |
| PUT | `/api/admin/users/:id` | 更新状态/VIP |
| GET | `/api/admin/partners` | 合伙人列表 |
| POST | `/api/admin/partners/:id/approve` | 激活/拒绝合伙人 |
| GET | `/api/admin/orders` | 订单对账 |
| GET | `/api/admin/withdrawals` | 提现审核 |
| PUT | `/api/admin/withdrawals/:id` | 处理提现 |
| GET | `/api/admin/marry-reports` | 结婚报备列表 |
| POST | `/api/admin/marry-reports/:id/approve` | 审核报备 `{ approve, reject_reason }` |
| GET | `/api/admin/privacy-logs` | 合规授权日志 |
| PUT | `/api/admin/stats` | 公示数据 `{ stats: { marry_success_count } }` 或平铺字段 |
| GET | `/api/admin/chat/sessions` | 人工客服队列 |
| POST | `/api/admin/chat/reply` | 回复 `{ session_id, content }` 或 `user_id` |
| GET/POST/PUT/DELETE | `/api/admin/knowledge` | AI 知识库 CRUD |
| GET | `/api/admin/export/{users,orders,partners}` | CSV 导出 |

### 字段别名（SPA 兼容）

管理/合伙人列表接口在服务端统一映射：

- 用户：`nickname`（城市+性别+年份）、`phone`（openid 摘要）、`vip_expire_at`、`is_divorced`
- 合伙人：`username`←`phone`、`real_name`←`name`
- 订单：`amount`←`price`、`status`←`pay_status`、`settled`←`settle_status`、`paid_at`←`pay_time`

---

## 默认账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | admin | admin123456 |

合伙人需在 `/partner/register.html` 注册后由管理员激活。

---

## 数据库补丁

新库执行 `database/init.sql`；已有库可追加：

```bash
mysql -u root -p < database/patch-002-partner-audit.sql
```

或使用 `database/import.bat` 一键导入。
