# Implementation Plan

- [x] 1. 准备 CloudBase 数据资源与本地集合契约
  - 通过 CloudBase MCP 核对正式环境和现有 `partners` 数据结构
  - 创建 `partner_candidates`、`partner_audit_logs` 及所需索引，不修改现有业务记录
  - 为逻辑集合映射、可引导集合白名单和资源契约编写失败测试后实现
  - _Requirements: R2, R3, R4, R6_

- [x] 2. 实现合伙人资格、编号与绑定策略
  - 测试驱动实现手机号规范化、HMAC 摘要、脱敏、状态机和 DTO
  - 实现 `WF-P-xxxx` / `WFPxxxx` 的事务编号分配与旧邀请码兼容
  - 实现重复手机号、重复用户、并发绑定和 binding_version 规则
  - _Requirements: R2, R3, R4, R6_

- [ ] 3. 实现管理后台审核与名单 API
  - 测试驱动实现名单单条录入、批量导入、申请查询和详情
  - 实现批准、驳回、暂停、恢复、解绑和撤销，强制原因、幂等与审计
  - 校验 super_admin/customer_service/auditor 权限和手机号脱敏
  - _Requirements: R2, R3, R5, R6_

- [ ] 4. 实现小程序免密激活与会话恢复 API
  - 实现当前微信用户的 onboarding status、申请、手机号激活和 session 恢复
  - 将微信手机号动态 code 的消费封装为可测试依赖，禁止记录敏感值
  - 让受保护接口校验 partner 状态和 binding_version
  - _Requirements: R1, R3, R5, R6_

- [ ] 5. 升级管理后台“合伙人审核与管理”界面
  - 实现审核队列、老板名单、已激活合伙人三个工作区
  - 实现录入/导入、状态筛选、详情抽屉和带原因的权限操作
  - 运行静态契约测试和真实浏览器流程验收
  - _Requirements: R2, R5, R6_

- [ ] 6. 升级小程序“我的”、激活页与合伙人 Dashboard
  - “我的”入口改为服务端状态驱动，不再依赖本地 partner token 决定可见性
  - 将旧密码登录页重构为申请/手机号验证多状态页面
  - 合并分享素材、邀请转化、佣金、余额和会员审核入口
  - 完成颜色、字体、SVG 图标、拒绝授权和无 Token 恢复测试
  - _Requirements: R1, R3, R5_

- [ ] 7. 迁移现有合伙人并准备指定用户授权
  - 编写 dry-run/confirm 幂等迁移，为旧合伙人回填 partner_code、摘要和 binding_version
  - 保留旧 promote_code、密码、归因、余额、佣金和提现记录
  - 先以 `TEST-000118` 验证直接授权，再在身份确认后处理 `WF-000015`
  - _Requirements: R3, R4, R5, R6_

- [ ] 8. CloudBase 审查、部署与端到端验收
  - 运行全部相关 selfcheck、语法检查、CloudBase 规则审查和 diff 审查
  - 仅通过 CloudBase MCP 更新 `api` 与既有管理后台托管
  - 验证函数 Active/Available、后台审核、测试激活、会话恢复、分享和 Dashboard
  - 不上传小程序正式版或体验版；真机手机号授权作为明确的人工验收项
  - _Requirements: R1, R2, R3, R4, R5, R6_
