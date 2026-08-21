# Role Permission Matrix (summary)

| Capability | super_admin | customer_service | auditor | finance | partner |
|---|---|---|---|---|---|
| 今日待办 | Y | Y | Y | Y | N |
| 客服工作台 | Y | Y | N | N | N |
| 用户 OpenID | Y (tech) | N | N | N | N |
| 会员审核 | Y | limited | Y (UI) | N | own scope |
| 提现审核 | Y | N | N | Y (UI) | own withdraw |
| 匹配/协调详情 | Y | via service | N | N | N |
| AI 私聊原文 | Y (ops) | Y (ops) | N | N | N |
| 推广用户列表 | Y | N | N | N | own only |
| 手机号明文 | Y (ops) | limited | N | N | masked only |
