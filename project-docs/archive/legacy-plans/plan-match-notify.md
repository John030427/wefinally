# 计划 · 匹配成功微信通知（订阅消息·预留 hook）

> 执行：**Codex**（先读仓库根 `AGENTS.md`）逐 Task 实现。
> ⚠️ **这是"预留代码"计划**：默认全关、全 no-op。真正生效需 ①真 AppID/Secret ②小程序后台配订阅消息模板拿 template_id ③用户主动授权。三者齐了再把 `notifyConfig.enabled=true` + 填 templateId 即用，**不改其它代码**(套路同"广东110跳转")。
> ⚠️ 这是 John 提的(非老板原话),但与老板"周三五空投匹配"机制天然配套。建议老板确认后再 enable。

**Goal**：周三/五匹配后，给被匹配用户发一条微信服务通知"你有新的匹配对象"。现在先把链路写好、留关。

## Task 1：notifyConfig（默认关）

**Files:** Create `server/src/config/notifyConfig.js`
```js
module.exports = {
  enabled: false,                 // 拿到 AppID+模板后改 true
  matchTemplateId: '',            // 小程序后台订阅消息模板 ID
  matchPage: 'pages/index/index', // 点通知进入的页面
};
```
commit `feat(config): notifyConfig for match subscribe message (off)`

## Task 2：微信通知服务（access_token 缓存 + 发送）

**Files:** Create `server/src/services/wxNotify.js`
```js
const axios = require('axios');
const cfg = require('../config/notifyConfig');

let _token = { value: '', exp: 0 };
async function getAccessToken() {
  const now = Date.now();
  if (_token.value && now < _token.exp) return _token.value;
  const appid = process.env.WX_APPID, secret = process.env.WX_SECRET;
  if (!appid || !secret) return '';
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid, secret },
  });
  if (!data.access_token) return '';
  _token = { value: data.access_token, exp: now + (data.expires_in - 300) * 1000 };
  return _token.value;
}

/** 发匹配通知；任何前提缺失都安静跳过，绝不抛错影响匹配主流程 */
async function sendMatchNotice(openid, { date = '', type = '' } = {}) {
  try {
    if (!cfg.enabled || !cfg.matchTemplateId || !openid) return;
    const token = await getAccessToken();
    if (!token) return;
    await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        touser: openid,
        template_id: cfg.matchTemplateId,
        page: cfg.matchPage,
        // ⚠️ data 的字段名(thing1/time2…)要按后台实际模板字段改
        data: { thing1: { value: '你有新的匹配对象' }, time2: { value: date || type } },
      }
    );
  } catch (e) {
    console.error('[wxNotify] send fail:', e.message); // 不抛
  }
}
module.exports = { sendMatchNotice };
```
commit `feat(notify): wxNotify subscribe-message sender (no-op until enabled)`

## Task 3：matchService 在匹配成功后发通知（best-effort）

**Files:** Modify `server/src/services/matchService.js`
- [ ] 顶部加 `const { sendMatchNotice } = require('./wxNotify');`
- [ ] `runBatchMatch`：在写 match_log、`matched += 1;` 处，记录这对的 openid。声明 `const notices = [];`（在 `usedThisBatch` 旁），并在成功插入后 push：
```js
      notices.push({ openid: user.openid, date: batchDate, type: matchType });
      notices.push({ openid: best.candidate.openid, date: batchDate, type: matchType });
```
- [ ] `await conn.commit();` **之后**（事务提交成功才通知）加：
```js
    for (const n of notices) { await sendMatchNotice(n.openid, { date: n.date, type: n.type }); }
```
> 默认 `enabled:false` → `sendMatchNotice` 直接 return，零副作用。
- [ ] `node --check server/src/services/matchService.js` + commit `feat(match): fire match notice after commit (gated)`

## Task 4：前端请求订阅授权

**Files:** Modify `miniprogram/utils/constants.js` + 一个高意向时机页（建议 `pages/match-setting` 保存成功后）
- [ ] constants.js 加 `const SUBSCRIBE_TMPL_IDS = []` 并导出（拿到模板 ID 后填入，如 `['xxxx']`）。
- [ ] match-setting 保存成功后调一次：
```js
const { SUBSCRIBE_TMPL_IDS } = require('../../utils/constants')
if (SUBSCRIBE_TMPL_IDS.length) {
  wx.requestSubscribeMessage({ tmplIds: SUBSCRIBE_TMPL_IDS, complete: () => {} })
}
```
> 数组为空 → 不弹,无副作用。
- [ ] commit `feat(notify): request subscribe permission after match-setting save (empty=no-op)`

## 启用步骤（拿到资源后，不改码）
1. `server/.env` 填真 `WX_APPID/WX_SECRET`；
2. 小程序后台「订阅消息」配模板 → 拿 template_id；
3. `notifyConfig.matchTemplateId` 填上、`enabled:true`；`constants.SUBSCRIBE_TMPL_IDS` 填同一 ID；
4. 按模板实际字段改 `wxNotify` 里 `data` 的 `thing1/time2`；
5. 真机:用户在择偶保存后点"允许" → 下次匹配即收到通知。

## 检查表
- [ ] enabled=false 时:发送函数直接 return、前端不弹订阅、匹配主流程完全不受影响(node 验收匹配仍正常)
- [ ] 发送失败被 try/catch 吞掉，绝不影响 matchCron/事务
- [ ] access_token 有缓存(不每次请求)
- [ ] 未改产品机制/UI 结构；commit 分任务
