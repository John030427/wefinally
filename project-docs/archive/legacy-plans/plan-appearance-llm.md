# 计划 · 外貌 LLM 匹配（方案丙）— 分支 feature/appearance-llm-match

> 执行：**Codex**（先读仓库根 `AGENTS.md`）；**在分支 `feature/appearance-llm-match` 上做**，逐 Task commit，最后不直接合 master。
> 取代 `plan-module03-appearance.md`（v1 纯文本框）——本计划已含输入框，并加 LLM 抽标签 + 匹配打分。

**Goal**：用户填「外貌描述(自己)」+「期待对方外貌」→ **存档时 LLM 各抽一次结构化标签**存库；匹配时按 **我的外貌 vs 对方的期待**（双向标签重合）算外貌分，计入匹配度。**LLM 只在写入时调用一次/人，匹配时只比标签（零 LLM 调用、零额外成本）。**

## 🚨 启用前必办（没办就保持默认关，分支可先合）
1. **霞姐知情同意**：丙 = 匹配引擎接入**外部大模型**，与已确认的「算法 v1 不接外部 LLM」相反；且和"做得非常官方/公安背书"方向下的数据合规需权衡。
2. **个保法授权**：把用户外貌/资料文本发给第三方 LLM，需用户**单独授权**条款 + 隐私政策更新。
3. **内容安全**：LLM 输出需机审兜底（即便只做标签）。
4. **模型/Key/预算**：John 申请到的模型(provider/endpoint/key/model)——填进 `llmConfig`。
> 以上未齐 → `llmConfig.enabled=false`：**不抽标签、外貌不计分、匹配回退到现状**，完全无副作用，分支可安全合并待命（套路同 110/notify hook）。

## 约束
- 不改 init.sql 结构（新 patch）。matchService 匹配时**不得**调 LLM（成本红线）。
- LLM 失败/超时**不得**影响资料保存与匹配主流程（best-effort + try/catch）。

---

## Task 1：DB — 外貌文本 + 期待 + 标签

`database/patch-006-appearance-llm.sql`：
```sql
USE wefinally;
ALTER TABLE `user` ADD COLUMN `appearance_description` TEXT DEFAULT NULL COMMENT '外貌描述(本人填)';
ALTER TABLE `user` ADD COLUMN `appearance_want` TEXT DEFAULT NULL COMMENT '期待对方外貌(本人填)';
ALTER TABLE `user` ADD COLUMN `appearance_tags` VARCHAR(500) DEFAULT NULL COMMENT 'LLM抽:本人外貌标签JSON数组';
ALTER TABLE `user` ADD COLUMN `appearance_want_tags` VARCHAR(500) DEFAULT NULL COMMENT 'LLM抽:期待外貌标签JSON数组';
```
导入 + 验收 + commit `feat(db): appearance text + want + llm tags`

## Task 2：config — llmConfig + matchConfig 外貌权重

`server/src/config/llmConfig.js`（新）：
```js
module.exports = {
  enabled: false,                  // 拿到模型+霞姐OK+授权后改 true
  baseURL: process.env.LLM_BASE_URL || '', // OpenAI 兼容端点(多数国产模型支持)
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || '',
  timeoutMs: 8000,
};
```
`matchConfig.js` 加：
```js
  useAppearanceInMatch: false, // 丙启用且有标签时才计入；默认关
  // weights 里加：
  // appearance: 10,           // 外貌（我方期待 vs 对方实际 标签重合）满分
```
commit `feat(config): llmConfig + appearance match weight (off)`

## Task 3：llmService — 抽标签（写时调用，OpenAI 兼容）

`server/src/services/llmService.js`（新）：
```js
const axios = require('axios');
const cfg = require('../config/llmConfig');

/** 从一段外貌文本抽 3-8 个结构化标签；未启用/失败返回 null（调用方据此跳过，不影响主流程） */
async function extractAppearanceTags(text) {
  try {
    if (!cfg.enabled || !cfg.apiKey || !cfg.baseURL || !cfg.model || !text) return null;
    const prompt = `把下面这段中文外貌描述抽成3-8个简短中文标签(体型/身高感/风格/气质/五官/穿搭等)，` +
      `只输出 JSON 数组，例如 ["高","文艺","戴眼镜"]。描述：${String(text).slice(0, 500)}`;
    const { data } = await axios.post(
      `${cfg.baseURL}/chat/completions`,
      { model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0 },
      { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: cfg.timeoutMs }
    );
    const out = data?.choices?.[0]?.message?.content || '';
    const m = out.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const tags = JSON.parse(m[0]);
    return Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : null;
    // ⚠️ 不同模型返回结构/字段可能不同，按实际所选模型 API 调整解析。
  } catch (e) {
    console.error('[llm] extractAppearanceTags fail:', e.message);
    return null;
  }
}
module.exports = { extractAppearanceTags };
```
commit `feat(llm): appearance tag extractor (no-op until enabled)`

## Task 4：保存时抽标签（PUT /profile）

`server/src/routes/user.js`：PUT `/api/user/profile`
- 解构加 `appearance_description, appearance_want`；
- 写入这两列（COALESCE 模式，同其它字段）；
- 写入成功后 best-effort 抽标签并更新（**不阻塞、失败不报错**）：
```js
const { extractAppearanceTags } = require('../services/llmService');
// ...UPDATE 基本字段之后：
if (appearance_description != null) {
  const tags = await extractAppearanceTags(appearance_description);
  if (tags) await pool.query('UPDATE `user` SET appearance_tags = ? WHERE id = ?', [JSON.stringify(tags), req.auth.id]);
}
if (appearance_want != null) {
  const wt = await extractAppearanceTags(appearance_want);
  if (wt) await pool.query('UPDATE `user` SET appearance_want_tags = ? WHERE id = ?', [JSON.stringify(wt), req.auth.id]);
}
```
> 未启用 LLM 时 `extractAppearanceTags` 返回 null → 不更新标签，外貌文本照存。
GET `/profile` 返回 `appearance_description`、`appearance_want`。commit `feat(user): save appearance text + extract tags on save`

## Task 5：matchService — 外貌分（匹配时只比标签，零 LLM）

`server/src/services/matchService.js`：
- 加 helper：
```js
function parseTags(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
```
- `getActiveVipUsers`/`getCandidates` 已 `SELECT u.*` → 含新列，无需改 SQL。
- `scorePair(user, settings, candidate, viewSim)` 末尾(return 前)加：
```js
  if (cfg.useAppearanceInMatch) {
    const want = parseTags(user.appearance_want_tags);     // 我方期待外貌标签
    const have = parseTags(candidate.appearance_tags);     // 对方实际外貌标签
    if (want.length && have.length) {
      const overlap = want.filter((t) => have.includes(t)).length / want.length;
      score += (cfg.weights.appearance || 0) * overlap;    // 双向打分时 A/B 各算一次，天然双向
    }
  }
```
commit `feat(match): appearance tag score (tag-only, no LLM at match time)`

## Task 6：前端 — 两个输入框

`pages/appearance`（同 v1，但两段 textarea）+ profile 菜单入口 + app.json 注册。
- 外貌描述(自己) textarea + 期待对方外貌 textarea + 保存 → PUT /profile {appearance_description, appearance_want}。
- 复用 .card/.textarea-input/.char-counter/.btn-primary。
commit `feat(profile): appearance + preference edit page`

## Task 7：验收
- **回退验收(现在就能跑,llmConfig.enabled=false)**：跑匹配冒烟(见之前 _rv 脚本)→ 匹配一切正常、外貌不计分、PUT 外貌文本能存能读、标签为 null。**证明默认关时零副作用。**
- **LLM 验收(等有 key)**：填 LLM_* env + enabled=true → 存外貌后 `appearance_tags` 有值；造"我方期待=对方实际"的一对 → 外貌分提升、匹配度变化。

## 检查表
- [ ] llmConfig.enabled=false 时：不调 LLM、外貌不计分、保存/匹配完全正常（回归）
- [ ] LLM 只在 PUT /profile 调、匹配时只比标签(grep 确认 matchService 不 import llmService 的调用)
- [ ] LLM 失败/超时被吞，不影响保存与匹配
- [ ] 未改 init.sql 结构/分润/支付；在 feature 分支、逐 Task commit
- [ ] 「启用前必办」4 项在文档/PR 里点明，未私自 enable
