# Status Copy Matrix

Central module: `server/src/utils/statusCopy.js`

Examples:

| code | label | next |
|---|---|---|
| pending_review | 待审核 | 请审核该会员申请 |
| need_more_info | 待补充资料 | 等待用户按意见补充资料 |
| no_match | 本轮暂无合适匹配 | 等待下一轮匹配 |
| pending_confirmation | 等待用户确认修改 | 可提醒用户确认或暂不修改 |
| STALE_COORDINATION_VERSION | （humanError）约会方案刚刚更新，请刷新后继续 | — |
