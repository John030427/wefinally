# CloudBase 管理后台会话与短域名准备记录

更新日期：2026-08-30  
范围：只读核对与上线准备；本轮未部署、未登录生产后台、未修改 DNS、未绑定域名、未上传证书、未修改生产环境变量。

## 结论

当前 CloudBase Admin Web 已适配用户—AI 会话处理，不需要再创建一套后台页面。

- 现有静态地址：`https://cloud1-d4gy8l52g08bba326-1451453378.tcloudbaseapp.com/admin/`
- 2026-08-30 只读 HTTP 核对：返回 `200 OK`，`Content-Type: text/html`。
- 远端页面已包含：`客服工作台`、会话列表、会话详情/完整时间线、人工客服回复框，以及 `/admin/agent/conversations` 列表、详情和回复调用。
- 页面明确显示“选择左侧会话后查看真实用户—AI聊天”。客服角色上下文保留“仅展示脱敏编号与必要状态”，未扩大为 OpenID、完整手机号、导出或用户修改权限。
- 本地合同测试 `server/selfcheck/backoffice-simple-web-final.js` 对上述入口、接口字符串、回复入口和隐私文案进行持续校验。

这次新增断言属于已有行为的 characterization：首次加入精确断言时即通过，因此没有为了满足文档而修改 Admin Web 或 RBAC。

## 当前数据路径

```text
CloudBase 静态托管 /admin/
  -> Admin Web（server/public/admin/index.html）
  -> CloudBase HTTP API
  -> /admin/agent/conversations
     /admin/agent/conversations/:id
     /admin/agent/conversations/:id/reply
  -> customer_service / super_admin 服务端鉴权与脱敏投影
```

人工回复会建立或更新处理工单，并保留后台查看/回复审计。前端存在入口不等于绕过权限；服务端仍是最终授权边界。

## 简短域名建议

推荐占位形式：`admin.<已持有且已备案的主域名>`。

不要把该占位形式当成已购买或已可用的域名。正式选择前需要由域名所有者确认品牌主域、备案主体与证书管理方式。若更强调客服用途，也可在已持有主域下选择 `ops.<主域>`，但一个稳定入口优于同时维护多个别名。

## 绑定前检查清单

1. 确认域名归属和续费责任人；中国大陆节点使用的域名按控制台要求完成 ICP 备案。
2. 在当前 CloudBase 环境的静态网站托管中添加自定义域名，并以控制台当时显示的校验记录和 CNAME 目标为准。
3. 为该域名启用有效 HTTPS 证书，确认自动续期或证书轮换责任人；不要开放 HTTP 管理入口。
4. DNS 生效后，核对 `/admin/` 返回的仍是本仓库对应版本，而不是旧缓存或其他环境。
5. 将 Cloud Function 的 `BACKOFFICE_CORS_ORIGIN` 收紧为最终 Admin Origin；不要在生产继续使用 `*`。若保留旧域名作为应急入口，应显式列出允许来源并测试预检请求。
6. 验证登录、会话查询、详情、人工回复、退出登录及 401/403；分别使用 `customer_service` 与无权限角色检查正负路径。
7. 检查页面和网络响应中不出现 OpenID、完整手机号、另一方私密协调输入、原始模型 prompt 或密钥。
8. 记录 DNS、证书、CloudBase 绑定、CORS 变更单和回滚方式，再安排低峰切换。

## 上线验收

```text
[ ] https://admin.<已持有主域>/admin/ 可访问且证书链有效
[ ] CloudBase 默认静态地址仍可作为受控回滚入口
[ ] 客服工作台能看到会话列表
[ ] 能打开单个会话和完整时间线
[ ] 人工回复成功且生成审计/工单记录
[ ] customer_service 只看到脱敏必要字段
[ ] auditor / finance 无权读取 Agent 会话
[ ] CORS 只允许批准的后台 Origin
[ ] 页面版本与目标 Git commit 可追踪
```

## 本轮未执行事项

- 未购买或注册域名。
- 未添加 CloudBase 自定义域名。
- 未写入 DNS 记录。
- 未上传或签发证书。
- 未修改 `BACKOFFICE_CORS_ORIGIN`。
- 未部署静态站点或 Cloud Function。
- 未发送真实客服回复或读取真实用户会话内容。
