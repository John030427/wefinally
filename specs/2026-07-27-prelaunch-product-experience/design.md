# 设计

## 信息架构

1. 首次进入：三段信任引导。
2. 首页：一张“当前阶段”卡片，只给一个主要行动。
3. 我的：资料完成度与缺失项。
4. 匹配详情：先给结论摘要，再按需展开算法细节。
5. 已安排约会：进入独立的约会后反馈页。

## 视觉方向

- 延续现有粉色品牌色，但降低娱乐感，采用暖白底、深灰正文、绿色可信状态。
- 页面内容左对齐，卡片圆角和间距复用现有体系。
- 主行动每屏最多一个；辅助入口采用文字按钮。
- 不用 emoji 承担关键状态含义，状态同时提供文字。

## 客户端模块

- `utils/productExperience.js`：资料完成度、首页阶段、匹配摘要纯函数。
- `pages/welcome`：首次信任引导。
- `pages/index`：阶段主行动。
- `pages/profile`：资料完成度卡片。
- `pages/match-detail`：摘要、折叠详情、匹配反馈。
- `pages/date-feedback`：约会后反馈。

## 云端模块

- `lib/experienceFeedbackPolicy.js`：反馈枚举、文本长度、幂等键与安全规则。
- `handlers/experienceFeedback.js`：当前用户鉴权、匹配归属检查、协调状态检查、幂等读写。
- 新集合：
  - `match_experience_feedback`
  - `date_experience_feedback`
- 集合仅通过受控缺失集合引导建立；本次不连接生产环境执行创建。

## API

- `GET /api/match/feedback?match_log_id=...`
- `POST /api/match/feedback`
- `GET /api/date-feedback?match_log_id=...`
- `POST /api/date-feedback`

所有写入由 `api` Event Function 白名单路由处理。

用户勾选人工复核时，服务会按反馈幂等键创建平台客服工单；不安全或资料差异明显的约会反馈使用 P1 优先级。约会反馈入口除要求协调状态为 `arranged` 外，还要求最终方案日期不晚于当前日期。
