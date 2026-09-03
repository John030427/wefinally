# Cloud Route Permission Matrix

所有 `/api/admin/*` 请求必须先通过签名 Token 认证、启用账号回查和已知角色校验，再进入本矩阵。缺失或未知角色一律 `403`。未列出的 lower-role 路由一律拒绝；`super_admin` 可访问实际 dispatcher 已实现的全部管理员路由。

| 路由族 | super_admin | customer_service | auditor | finance |
|---|---:|---:|---:|---:|
| `GET /api/admin/orders` | 允许 | 允许 | 拒绝 | 允许 |
| `GET /api/admin/matches[/:id]` | 允许 | 允许 | 拒绝 | 拒绝 |
| `GET /api/admin/agent/tickets[/:id]` | 允许 | 允许 | 拒绝 | 拒绝 |
| `POST /api/admin/agent/tickets/:id/reply|close` | 允许 | 允许 | 拒绝 | 拒绝 |
| `GET /api/admin/agent/conversations[/:id]` | 允许 | 允许 | 拒绝 | 拒绝 |
| `POST /api/admin/agent/conversations/:id/reply` | 允许 | 允许 | 拒绝 | 拒绝 |
| `GET /api/admin/date-coordinations` | 允许 | 允许 | 拒绝 | 拒绝 |
| `GET /api/admin/member-applications[/:id]` | 允许 | 拒绝 | 允许 | 拒绝 |
| `PUT /api/admin/member-applications/:id/review` | 允许 | 拒绝 | 允许 | 拒绝 |
| `GET /api/admin/users[/:id]` | 允许 | 拒绝 | 允许 | 拒绝 |
| `GET /api/admin/partners` | 允许 | 拒绝 | 允许 | 拒绝 |
| `GET /api/admin/partner-candidates[/:id]` | 允许 | 拒绝 | 允许（响应脱敏） | 拒绝 |
| `GET/PUT /api/admin/withdrawals[/:id]` | 允许 | 拒绝 | 拒绝 | 策略允许；当前 Cloud dispatcher 未实现，实际返回 404 |
| 合伙人、用户、测试夹具、知识库及受控场景的写操作 | 允许 | 拒绝 | 拒绝（会员审核除外） | 拒绝 |

Cloud 的聚合 dashboard 横跨多个业务域，因此 lower-role 不继承 Express 页面级 dashboard 权限；只有 `super_admin` 可读取。该收紧不扩大任何权限。

响应数据规则：除 `super_admin` 外，统一删除 OpenID、UnionID、未遮罩手机号、raw/prompt AI 字段、私密协调字段、`match_settings`、snapshot、原始审计/隐私日志和测试/fixture 元数据，并对字符串中的 11 位手机号再次遮罩。
