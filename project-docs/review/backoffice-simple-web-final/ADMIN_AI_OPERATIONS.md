# ADMIN_AI_OPERATIONS

## Truthful status

```json
{
  "ai_ops": {
    "status": "normal | degraded | unknown",
    "status_text": "正常 | 异常 | 状态未知",
    "provider": "<actual or null>",
    "model": "<actual or null>",
    "expected_provider": "<config target>",
    "expected_model": "<config target>",
    "failed_today": "<number|null>",
    "data_available": true,
    "last_run_at": "...",
    "note": "..."
  }
}
```

## Rules

| Condition | UI |
|---|---|
| Query/table failure | 状态未知 · 暂无运行统计 · 不显示「正常」 |
| No run data | 状态未知 · provider/model = 未确认 |
| failed_today > 0 | 异常 |
| Reliable runs + zero fails | 正常 · 显示实际 latest provider/model |

Never hardcode HY3 as “recent actual run”. Config targets labeled 配置目标.
