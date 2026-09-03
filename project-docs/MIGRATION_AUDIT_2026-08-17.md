# Migration 审计 — patch-014（2026-08-17）

> 只读审计，未执行任何 migration，未触碰生产库。

## 范围
- database/patch-014-user-identity-province-ai-profile.sql（多身份 + 省/市 + AI Match Profile + 站内通知表）
- CloudBase NoSQL 集合注册改动：collectionBootstrapPolicy.js 新增
  `coordination_notification` / `user_notification_cursor`（自动 bootstrap）。

## SQL 语法
- `CREATE TABLE IF NOT EXISTS ...`：MySQL 8.0 / MariaDB 均支持，幂等。
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`：
  - MariaDB 支持；**MySQL 8.0 不支持**（语法会报错）。patch 文件内注释已声明
    “MySQL versions without IF NOT EXISTS on ADD COLUMN: apply manually”。
  - 评估：需用 information_schema 守卫或迁移 runner 逐列判断后再 ALTER，才能对 MySQL 8.0 幂等。
- UNIQUE KEY / FK：合法；新增 FK 指向 user(id)，无破坏性。

## 幂等性
- 表创建幂等；列添加在 MariaDB 下幂等；MySQL 8.0 下需上述守卫。
- 没有 DROP、重命名、类型变更；backward compatible。

## 与运行时的一致性
- 本地 MySQL（server）与 CloudBase NoSQL 是两套存储：patch-014 只约束本地 schema；
  云端集合由集合注册 + withCollectionBootstrap 在首次写入时自动创建（本轮已把
  通知两张表加入 bootstrap 白名单）。
- 应用层后向兼容：profilePayload 无新增必填字段；缺省值（省份空串等）已兜底。

## 结论
- 结构层面：additive + 可回退（附加表/列，代码回滚不影响旧逻辑）。
- 提请注意：MySQL 8.0 执行前需补列级守卫；本轮未在本地执行（127.0.0.1:3306 无可用实例）。

## Production
- **NOT EXECUTED**：任何 production migration 等待人工审批。
