# Fail-open Audit

## 已修复

1. `handlers/backoffice.js::actorFrom` 原来以 `row.role || 'super_admin'` 把缺失 NoSQL 角色提升为超级管理员。现改为已知角色白名单校验，缺失/未知均 `403`。
2. `handlers/backoffice.js::loginAdmin` 原来在登录响应中回退 `super_admin`。现登录阶段即拒绝缺失/未知角色。
3. `agent/backofficeService.js` 与 `agent/userBackofficeService.js` 原来把缺失 `actor.admin_role` 回退为 `super_admin`。现统一调用集中角色校验，直接服务调用也 fail-closed。
4. Cloud dispatcher 原来只做 admin 身份认证，会员审核、合伙人创建/更新等直达路由没有统一角色授权。现所有 `/api/admin/*` 在任何业务分发前执行集中式方法+路径白名单。
5. Cloud 用户服务原来允许 auditor 读取订单/匹配，却不允许 finance 读取订单。现与业务角色边界一致：auditor 只读用户/会员/合伙人，finance 只读订单，customer_service 处理客服、订单和匹配。
6. Express `admin-login` 原来以缺失角色回退 `super_admin`，管理员创建也会把无效角色默认成 `super_admin`。两处均改为显式拒绝。

## 数据库补丁判定

`database/patch-012-admin-service-role.sql` 保留显式一次性迁移：为历史管理员写入 `super_admin`，并为新列设置非空约束。该 SQL 是受审查的数据迁移动作，不是运行时权限兜底。迁移完成后，Cloud NoSQL 与 Express MySQL 运行时都要求角色字段为四个已知值之一。

## 三层边界

- 认证：签名 Token + 账号存在 + `status=1` + 已知存储角色。
- 路由授权：集中式角色/方法/路径白名单，未知路径对 lower-role 拒绝。
- 响应数据授权：lower-role 返回前递归投影与手机号二次遮罩。

未发现残留的 `admin_role || 'super_admin'`、`row.role || 'super_admin'` 或 Express 登录角色回退。
