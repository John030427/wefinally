# AI 报告任务部署清单

## 1. 云数据库

创建集合 `ai_report_tasks`，权限设为仅云函数可读写。

建议索引：

- `status` 升序
- `status + next_retry_at` 组合升序
- `input_expires_at` 升序
- `report_expires_at` 升序
- `status + delete_after` 组合升序

## 2. api 云函数

保留现有 MiniMax 环境变量，不要把 Key 写入代码或数据库。上传并部署 `cloudfunctions/api`，选择云端安装依赖，执行超时保持 20 秒。

## 3. report-worker 云函数

上传并部署 `cloudfunctions/report-worker`，选择云端安装依赖，执行超时 20 秒。随后右键该函数选择“上传触发器”，确认 `ai-report-worker-every-minute` 已启用。

触发器每分钟调用 `api`，每轮最多处理 2 个任务，同时执行输入快照、过期报告和注销任务清理。

## 4. 小程序验证

1. 审核未通过或 VIP 无效用户不能匹配、创建或查看报告。
2. 新匹配立即进入详情，任务状态为排队中或生成中。
3. 页面每 3 秒刷新，成功后展示结构化报告并永久隐藏生成按钮。
4. 历史真实 AI 文本迁移为已生成；历史空报告在打开详情时入队。
5. 模型失败显示明确失败状态，允许有限手动重试。
6. 注销后双方报告和输入快照立即不可访问并被清空。
