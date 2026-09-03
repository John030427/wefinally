# Files Changed

## 运行时代码

- `miniprogram/cloudfunctions/api/lib/cloudBackofficeRbac.js`：集中角色、Cloud 路由及 lower-role 响应授权。
- `miniprogram/cloudfunctions/api/handlers/backoffice.js`：登录与请求身份 fail-closed；业务分发前授权；返回前数据投影。
- `miniprogram/cloudfunctions/api/agent/backofficeService.js`：移除缺失角色超级管理员兜底。
- `miniprogram/cloudfunctions/api/agent/userBackofficeService.js`：移除兜底并校正 user/order/match 服务角色。
- `server/src/routes/auth.js`：Express 管理员登录拒绝缺失/未知角色。
- `server/src/routes/admin.js`：创建管理员时拒绝缺失/未知角色，不再默认超级管理员。

## 自检

- `server/selfcheck/cloud-backoffice-rbac-final.js`：真实 Cloud dispatcher 攻击与响应隐私测试。
- `server/selfcheck/admin-user-cloud-service.js`：校正 Cloud 用户服务角色断言并补 finance/未知角色测试。
- `server/selfcheck/agent-backoffice.js`：补 Agent 服务缺失/未知角色拒绝测试。

## 审查文档

- `project-docs/DEVELOPMENT_LOG.md`：记录本轮安全加固与验证边界。
- `project-docs/review/cloud-backoffice-rbac-final/README.md`
- `project-docs/review/cloud-backoffice-rbac-final/CLOUD_ROUTE_PERMISSION_MATRIX.md`
- `project-docs/review/cloud-backoffice-rbac-final/FAIL_OPEN_AUDIT.md`
- `project-docs/review/cloud-backoffice-rbac-final/REAL_ROUTE_ATTACK_TESTS.md`
- `project-docs/review/cloud-backoffice-rbac-final/REGRESSION_RESULTS.md`
- `project-docs/review/cloud-backoffice-rbac-final/FINAL_VERDICT.md`
- `project-docs/review/cloud-backoffice-rbac-final/FILES_CHANGED.md`

未改 `database/patch-012-admin-service-role.sql`：审计确认其为显式历史迁移，而非运行时 fallback。
