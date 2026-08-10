# 计划 · 外貌描述 v1（长相外貌描述框）

> ⛔ **已被取代**：霞姐要"外貌增加匹配度" → 改走方案丙(LLM 抽标签匹配),见 **`plan-appearance-llm.md`**(分支 `feature/appearance-llm-match`)。本 v1 纯文本框计划**不再单独执行**,其输入框已并入丙。保留存档。

> 执行：**Codex**（先读仓库根 `AGENTS.md`）逐 Task 实现 → 对照检查表自检。
> 来源：C4 / 2026-06-29 John 转述霞姐"要长相外貌描述框"。详见 `MODULES/03`。

**Goal（v1）**：用户在「我的」自填一段**纯文本**外貌描述（选填）→ 存库，**本人 + 后台可见**。
**不做（YAGNI/暂缓）**：
- ❌ 进匹配打分（`matchConfig.useAppearanceInMatch` 保持 false）
- ❌ 展示给匹配对象（`safetyConfig.appearanceVisibleToMatch` 默认 false，留位待确认；本计划不建 match-detail 展示）
- ❌ LLM 关键词→画像（v2，等 John 申请 LLM 后另出）
→ 现在只做"填写框 + 存储 + 本人/后台可见"。

## 约束
- 不改 init.sql 结构（加列走新 patch）。复用现有 UI（textarea 仿 match-setting）。
- 后端 PUT `/api/user/profile` 已存在（user.js），在它上面加字段即可，别新建写接口。

---

## Task 1：DB 加列

**Files:** Create `database/patch-006-appearance.sql`
```sql
USE wefinally;
ALTER TABLE `user` ADD COLUMN `appearance_description` TEXT DEFAULT NULL COMMENT '外貌文字描述(v1仅本人+后台可见)';
```
- [ ] 导入：`docker exec -i wefinally-mysql mysql -uroot -pwefinally123 wefinally < database/patch-006-appearance.sql`
- [ ] 验收：`docker exec wefinally-mysql mysql -uroot -pwefinally123 wefinally -e "SHOW COLUMNS FROM user LIKE 'appearance%';"`
- [ ] commit `feat(db): user.appearance_description`

## Task 2：safetyConfig 加两项

**Files:** Modify `server/src/config/safetyConfig.js`
```js
  appearanceMaxLen: 500,            // 外貌描述最大字数
  appearanceVisibleToMatch: false,  // v1 不展示给匹配对象（留位，待确认）
```
- [ ] commit `feat(config): appearance length + visibility(off)`

## Task 3：后端 PUT/GET profile 支持该字段

**Files:** Modify `server/src/routes/user.js`

- [ ] **Step 1**：PUT `/api/user/profile` 处理函数里：
  - 顶部已 `require` safetyConfig？没有就加：`const safetyCfg = require('../config/safetyConfig');`
  - 在解构 `req.body` 处加入 `appearance_description`；
  - 加长度校验（在 UPDATE 之前）：
```js
    if (appearance_description != null && String(appearance_description).length > safetyCfg.appearanceMaxLen) {
      return fail(res, `外貌描述不超过 ${safetyCfg.appearanceMaxLen} 字`);
    }
```
  - 在 `UPDATE \`user\` SET ...` 语句加一列：`appearance_description = COALESCE(?, appearance_description),`，并在参数数组对应位置加 `appearance_description ?? null`（顺序与占位符一致）。
- [ ] **Step 2**：GET `/api/user/profile` 返回里带 `appearance_description`（在 `buildProfilePayload` 里加该字段；若是字段白名单，确保包含）。
- [ ] **Step 3**：`node --check server/src/routes/user.js`
- [ ] commit `feat(user): appearance_description in profile get/put (self only)`

> 后台：admin 用户详情若已返回 user 整行，则自动可见；如未含，在 admin 用户详情接口补该字段（可选）。

## Task 4：前端「编辑外貌描述」页

**Files:** Create `miniprogram/pages/appearance/`（.js/.wxml/.json/.wxss）；Modify `app.json`、`profile`

- [ ] **app.json** `pages` 加 `"pages/appearance/appearance"`。
- [ ] **profile.menuList** 加一项（在「择偶配置」附近）：`{ icon: '🧑', title: '外貌描述', url: '/pages/appearance/appearance' }`。
- [ ] **pages/appearance/appearance.js**（载入已有值 + 保存）：
```js
const { get, put } = require('../../utils/request')
Page({
  data: { text: '', maxLen: 500 },
  async onLoad() {
    try { const p = await get('/api/user/profile', {}, { showError: false }); this.setData({ text: (p && p.appearance_description) || '' }) } catch (e) {}
  },
  onInput(e) { this.setData({ text: e.detail.value }) },
  async save() {
    try {
      await put('/api/user/profile', { appearance_description: this.data.text }, { showLoading: true })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) { wx.showModal({ title: '保存失败', content: (e && e.message) || '', showCancel: false }) }
  }
})
```
> ⚠️ 确认 `utils/request.js` 导出了 `put`；若只有 `post`，则用 `post` 且后端那条也接 POST，或给 request 补 `put`。**以 request.js 实际为准**。
- [ ] **appearance.wxml**（复用 app.wxss 的 .card/.textarea-input/.char-counter/.btn-primary）：
```xml
<view class="container">
  <view class="card">
    <view class="form-label">长相外貌描述（选填）</view>
    <textarea class="textarea-input" maxlength="{{maxLen}}" placeholder="用文字描述你的长相/身形/气质/穿搭（不评分、不上传照片）" value="{{text}}" bindinput="onInput"></textarea>
    <view class="char-counter">{{text.length}}/{{maxLen}}</view>
  </view>
  <button class="btn-primary" bindtap="save">保存</button>
</view>
```
- [ ] **appearance.json**：`{ "navigationBarTitleText": "外貌描述" }`；**.wxss** 可留空或少量边距。
- [ ] commit `feat(profile): appearance description edit page`

## Task 5：验收（curl）
```bash
BASE=http://localhost:3000; SECRET=$(grep '^JWT_SECRET=' server/.env | cut -d= -f2)
Q(){ docker exec wefinally-mysql mysql -uroot -pwefinally123 wefinally -N -e "$1" 2>/dev/null; }
Q "DELETE FROM \`user\` WHERE openid='ap1';"
Q "INSERT INTO \`user\`(openid,gender,birth_year,height_range,education,circle_id,marry_status,baby_plan,status) VALUES ('ap1',1,1995,'170-180cm','BK',1,'single','3-5y',1);"
U=$(Q "SELECT id FROM \`user\` WHERE openid='ap1';")
T=$(cd server && node -e "console.log(require('jsonwebtoken').sign({id:$U,role:'user',openid:'ap1'},'$SECRET',{expiresIn:'1h'}))")
echo "存:"; curl -s -X PUT "$BASE/api/user/profile" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"appearance_description":"高，文艺，戴眼镜"}' -o /dev/null -w "%{http_code}\n"
echo "读回:"; curl -s "$BASE/api/user/profile" -H "Authorization: Bearer $T" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.appearance_description))"
echo "DB:"; Q "SELECT appearance_description FROM \`user\` WHERE id=$U;"
Q "DELETE FROM \`user\` WHERE openid='ap1';"
```
Expected：存 200 / 读回与 DB 均为"高，文艺，戴眼镜"。超长(>500)应被拒。

## 检查表
- [ ] 存/读/DB 一致；超长被拒
- [ ] **不展示给匹配对象**（match-detail 未加该字段）；**不进打分**（matchService 未改）
- [ ] LLM 部分未做（v2）
- [ ] 未改 init.sql 结构/分润/支付；commit 分任务
