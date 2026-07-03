# WeFinally 新对话交接 2026-07-03

## 当前定位
- 代码根目录：`D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目`
- 当前分支：`feature/match-ai-weighted`
- 本地后端：`http://127.0.0.1:3000`，健康检查通过
- 小程序 API：`miniprogram/app.js` 指向 `http://127.0.0.1:3000`
- 本地登录：`server/.env` 里 `DEV_WX_LOGIN_ENABLED=true` 时，微信开发者工具可用本地 openid

## 本轮已完成
1. 匹配演示数据更真实
   - `npm run demo:match-seed` 生成 8 条本地演示匹配。
   - 不再全是 31 岁，候选年龄段分布为 `25-30岁`、`30-35岁`、`35-40岁`、`40-45岁`。
   - 前台首页/记录页显示年龄段，不显示精确年龄。

2. 前台匹配展示降承诺
   - 不再主视觉展示 `100%`、`118分` 这类强承诺数字。
   - 改为 `综合较高契合`、`三观值得了解`、`关系偏好较为接近` 等等级文案。
   - 原始分数仍在 API 和字段拆解里保留，便于算法验收。

3. 外貌描述进入择偶/匹配流程
   - `match-setting` 页面新增“外貌偏好”卡片，可填写：
     - 我的外貌描述
     - 期待对方外貌
   - 保存时复用 `PUT /api/user/profile`，不新增表、不新增接口。
   - `match-detail` 新增“外貌匹配参考”卡片。
   - 不展示对方外貌原文，不默认开启 LLM/外貌加权。
   - 现有开关仍保持：`llmConfig.enabled=false`、`matchConfig.useAppearanceInMatch=false`。

4. 线下见面安全确认 500 修复
   - 后端 `POST /api/meet/create` 对 `meet_time` 做标准化。
   - 支持 `2026-9-01 18：00` 这类单数字月份、全角冒号输入。
   - 非法时间返回业务错误，不再让 MySQL 抛 500。

5. 注销/婚姻报备后匹配池收口
   - 管理后台审核“账号注销”通过后：
     - `user.status=BANNED`
     - 清空 VIP
     - 删除该用户 `user_match_setting`
     - 删除涉及该用户的 `user_match_log`
   - 结果：该用户不再进入后续匹配池，也不继续出现在别人匹配记录里。

## 已跑验收
```bash
cd server
npm run selfcheck
npm run demo:match-clear
npm run demo:match-seed
```

额外 API 验证：
```text
POST /api/meet/create meet_time=2026-9-01 18：00 -> code=0
GET /api/match/list -> 8 条演示记录，返回 age_band
```

## 产品决策记录
- 期望年龄不建议做多选。继续保持单一区间更符合原设计和当前 `age_min/age_max` 算法。
- “随意年龄”后续可加 `不限年龄`，但不要做多个离散年龄段多选，容易制造奇怪硬过滤。
- 外貌“增加匹配度”先做资料入口和匹配详情提示；真正参与算法应等霞姐确认：
  - 是否展示给匹配对象
  - 是否允许 LLM 抽标签
  - 是否加入个人信息授权
  - 是否有内容安全和成本预算

## 继续优化建议
1. 我的页信息架构
   - 当前像工具清单。
   - 建议分组为：资料完善、会员权益、安全与报备、平台服务。

2. 匹配详情字段
   - 当前字段拆解对开发友好，对普通用户仍偏“算法面板”。
   - 可增加“为什么推荐 TA”自然语言摘要，AI 默认关时用模板生成。

3. 年龄设置
   - 保持区间。
   - 可新增 `不限年龄` 选项，但需要 GET/POST 对 null 年龄做一致回显。

4. 外貌匹配
   - 下一步如果要真“增加匹配度”，建议只启用标签重合分，不直接用自由文本打分。
   - 仍不上传图片，不做颜值分。

5. 微信开发者工具手测
   - 刷新「记录」页，应看到 8 条演示匹配。
   - 点详情，应看到年龄段、外貌匹配参考、无裸分主视觉。
   - 进入「择偶配置」，应看到外貌偏好卡片。
   - 进入「线下见面安全确认」，输入 `2026-9-01 18：00` 应保存成功。

## 新对话启动建议
可以直接对新 Codex 说：

```text
请在 D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目 打开项目，读 AGENTS.md 和 project-docs/NEXT_THREAD_HANDOFF_2026-07-03.md。当前分支 feature/match-ai-weighted。先确认 git status，再继续做微信开发者工具手测和 profile 我的页信息架构优化。
```
