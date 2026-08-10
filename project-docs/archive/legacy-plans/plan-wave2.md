# WeFinally 实施计划 · 第 2 波：双向互配 + 候选放开非VIP + 非VIP模糊 + 详情字段收紧

> **执行者**：Cursor（GPT-5.5）→ Composer 逐任务实现 → GPT 对照文末检查表 review。
> **前置**：必须先完成 plan.md 第 1 波（R0 跑通 + 本地 MySQL 可连 + R1/R3 已合并）。本波碰**核心匹配算法**，风险高于第 1 波，务必每个 Phase 做完就跑测试脚本。

**Goal**：把匹配从「单向、候选要 VIP」改成「**双向互配、候选放开非 VIP、对称记录**」；并让**非 VIP 看模糊详情 + 开通引导**、**VIP 详情字段收紧为最小集**。

**Architecture**：后端 `matchService.js`（算法）+ `match.js`（展示接口按 VIP 分级返回）；前端只改 `match-detail`（模糊态 + 收紧字段）。**不改** UI 设计系统、不改分润/支付、不动 init.sql 结构。

**Tech Stack**：Node/Express + mysql2 + 原生微信小程序。无测试框架 → 用**自包含 node 脚本**做验收（连本地 Docker MySQL）。

---

## 0. 必读约束

- 代码根目录（双层嵌套）：`D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\`。下文路径相对此根。
- 本地库：Docker 容器 `wefinally-mysql`（root/`wefinally123`，库 `wefinally`，3306）。测试脚本要连它。
- **锁定需求**（来自 project-docs，不可改）：被匹配对象不要求 VIP（B12）；双向互配必做（B13）；非 VIP 详情模糊 + VIP 引导（Q1）；详情字段收紧为最小集（Q2，**不展示** 姓名/照片/联系方式/性别/城市/精确身高）。
- **不能动**：`orderService` 分润；`matchCron` 周三/五节奏；`app.wxss`；`database/init.sql` 结构（如需加列写新 patch）；用户端无图片/无私聊红线。
- **小步提交**，每 Task 至少 1 个 commit。

## ⚠️ 设计决策（请你/老板复核；Composer 按此实现）

1. **双向互配语义 = Option C**：每批次迭代有效 VIP 作发起方；候选放开非 VIP（须有择偶设置行）；**仅当双方择偶条件互相满足**才配对；配成对称写两条、每人每批次 ≤1 条；非 VIP 被配到看模糊版。
2. **"互相满足"的判定**：用 `scorePair` 双向各算一次，取 `combined=(scoreAB+scoreBA)/2` 排序；并要求 `min(scoreAB,scoreBA) >= MIN_SIDE_SCORE`（默认 20，可调）作为"互相满足"门槛——某一方明显不满足则不配。`MIN_SIDE_SCORE` 写成 matchService 顶部常量，附测试脚本便于调参。
3. **不新增表/字段**：复用现有 `user_match_log`（不加 match_role/match_score，保持 init.sql 不变）。
4. **身高展示**：本波详情**先不展示身高**（Q2 要求不展示精确身高；身高改区间属独立的「身高区间」计划，落地后再把区间加回详情）。

> 若 1 或 2 与老板预期不符，改这里即可，其余任务据此调整。

---

## Phase 1 — matchService：双向互配 + 候选放开非 VIP

**Files：**
- Modify：`server/src/services/matchService.js`
- Test：`server/test-wave2-match.js`（新建，临时验收脚本）

### Task 1.1：候选放开非 VIP + 加载候选择偶设置

- [ ] **Step 1**：打开 `server/src/services/matchService.js`，找到 `getCandidates`（约 89-104 行）：

```js
async function getCandidates(conn, user) {
  const targetGender = user.gender === 1 ? 2 : 1;
  const [rows] = await conn.query(
    `SELECT u.*, ms.self_view_text, ms.target_view_text
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.id != ?
       AND u.status = ?
       AND u.gender = ?
       AND u.marry_status != '离异'
       AND u.is_vip = 1
       AND u.vip_expire_time > NOW()`,
    [user.id, USER_STATUS.NORMAL, targetGender]
  );
  return rows;
}
```

- [ ] **Step 2**：替换为（去掉 VIP 两行；加载候选完整择偶设置，供双向打分用）：

```js
async function getCandidates(conn, user) {
  const targetGender = user.gender === 1 ? 2 : 1;
  // 候选放开非 VIP：异性 / 正常 / 非离异 / 有择偶设置即可（B12）
  const [rows] = await conn.query(
    `SELECT u.*, ms.age_min, ms.age_max, ms.height_min, ms.height_max,
            ms.min_education, ms.like_circle_ids, ms.like_marry_status,
            ms.like_baby_plan, ms.like_income, ms.like_house_car,
            ms.self_view_text, ms.target_view_text
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.id != ?
       AND u.status = ?
       AND u.gender = ?
       AND u.marry_status != '离异'`,
    [user.id, USER_STATUS.NORMAL, targetGender]
  );
  return rows;
}
```

- [ ] **Step 3 提交**：

```bash
git add server/src/services/matchService.js
git commit -m "feat(match): open candidate pool to non-VIP and load their match settings"
```

### Task 1.2：新增双向打分门槛常量 + 候选 settings 提取helper

- [ ] **Step 1**：在 `matchService.js` 顶部 `require` 之后、`calcAge` 之前，加入常量与 helper：

```js
// 双向互配参数（可调；详见 plan-wave2 设计决策 2）
const MIN_SIDE_SCORE = 20;       // 任一方满足度低于此值则不配对
const COMBINE = (ab, ba) => (ab + ba) / 2; // 综合分用于排序

// 从候选行(含 ms.* 列)取出 scorePair 需要的 settings 形状
function settingsOf(row) {
  return {
    age_min: row.age_min,
    age_max: row.age_max,
    height_min: row.height_min,
    height_max: row.height_max,
    min_education: row.min_education,
    like_circle_ids: row.like_circle_ids,
    like_marry_status: row.like_marry_status,
    like_baby_plan: row.like_baby_plan,
    like_income: row.like_income,
    like_house_car: row.like_house_car,
  };
}
```

- [ ] **Step 2 提交**：

```bash
git add server/src/services/matchService.js
git commit -m "feat(match): add bidirectional scoring knobs and settingsOf helper"
```

### Task 1.3：runBatchMatch 改为双向互配 + 对称写入 + 去重 + 每批次≤1

- [ ] **Step 1**：找到 `runBatchMatch` 的主循环体（约 119-175 行，从 `for (const user of vipUsers) {` 到写入 `INSERT ... user_match_log` 并 `matched += 1;` 结束）。当前实现是「单向选最优 + 写一条」。整体替换 `for (const user of vipUsers) { ... }` 循环为：

```js
    const usedThisBatch = new Set(); // 本批次已配对的 user id，保证每人≤1条

    for (const user of vipUsers) {
      if (usedThisBatch.has(user.id)) continue;

      // 该 VIP 本批次是否已有记录（幂等/重跑保护）
      const [already] = await conn.query(
        'SELECT id FROM user_match_log WHERE user_id = ? AND match_date = ? LIMIT 1',
        [user.id, batchDate]
      );
      if (already.length > 0) { usedThisBatch.add(user.id); continue; }

      const settingsA = settingsOf(user);
      const candidates = await getCandidates(conn, user);
      if (candidates.length === 0) continue;

      users += 1;

      // 双向打分 + 互相满足门槛
      const scored = [];
      for (const c of candidates) {
        if (usedThisBatch.has(c.id)) continue; // 对方本批次已被配走
        // 对方本批次是否已有记录
        const [cHas] = await conn.query(
          'SELECT id FROM user_match_log WHERE user_id = ? AND match_date = ? LIMIT 1',
          [c.id, batchDate]
        );
        if (cHas.length > 0) continue;

        const viewSim = computeViewSimilarity(
          user.self_view_text, user.target_view_text,
          c.self_view_text, c.target_view_text
        );
        const scoreAB = scorePair(user, settingsA, c, viewSim);       // A 的条件看 B
        const scoreBA = scorePair(c, settingsOf(c), user, viewSim);   // B 的条件看 A
        if (Math.min(scoreAB, scoreBA) < MIN_SIDE_SCORE) continue;    // 单向不满足 → 不配
        scored.push({ candidate: c, viewSim, combined: COMBINE(scoreAB, scoreBA) });
      }

      if (scored.length === 0) continue;
      scored.sort((a, b) => b.combined - a.combined || b.viewSim - a.viewSim);
      const best = scored[0];

      // 对称写入两条（A→B、B→A），同分同批次
      await conn.query(
        `INSERT INTO user_match_log
         (user_id, match_user_id, view_similarity, match_date, match_type)
         VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        [
          user.id, best.candidate.id, best.viewSim, batchDate, matchType,
          best.candidate.id, user.id, best.viewSim, batchDate, matchType,
        ]
      );
      usedThisBatch.add(user.id);
      usedThisBatch.add(best.candidate.id);
      matched += 1; // 计「成对」数
    }
```

> 说明：保留外层 `conn.beginTransaction()/commit()/rollback()` 不变；保留 `getActiveVipUsers`、`scorePair`、`computeViewSimilarity` 不变。删除原循环里旧的单向 `INSERT` 与旧 `dup` 检查（已被新逻辑取代）。

- [ ] **Step 2**：确认 `runBatchMatch` 返回值仍为 `{ matched, users }`（`matched` 现表示成对数）。

- [ ] **Step 3 语法检查**：

Run: `node --check server/src/services/matchService.js`
Expected: 无输出（通过）

- [ ] **Step 4 提交**：

```bash
git add server/src/services/matchService.js
git commit -m "feat(match): bidirectional mutual-fit matching with symmetric records (<=1/batch)"
```

### Task 1.4：写验收脚本并运行

- [ ] **Step 1**：新建 `server/test-wave2-match.js`：

```js
// 临时验收脚本：node test-wave2-match.js  （连本地 Docker MySQL）
require('dotenv').config();
const pool = require('./src/config/db');
const { runBatchMatch } = require('./src/services/matchService');

async function seedUser(openid, gender, vip, setting) {
  await pool.query("DELETE ms FROM user_match_setting ms JOIN `user` u ON u.id=ms.user_id WHERE u.openid=?", [openid]);
  await pool.query('DELETE FROM `user` WHERE openid=?', [openid]);
  const [r] = await pool.query(
    `INSERT INTO \`user\`(openid,gender,birth_year,height_range,education,circle_id,marry_status,baby_plan,status,is_vip,vip_expire_time)
     VALUES (?,?,?, '175cm','BK',1,'single','3-5y',1, ?, ?)`,
    [openid, gender, 1995, vip ? 1 : 0, vip ? new Date(Date.now()+30*864e5) : null]
  );
  const uid = r.insertId;
  await pool.query(
    `INSERT INTO user_match_setting(user_id,age_min,age_max,height_min,height_max,min_education,like_circle_ids,self_view_text,target_view_text,last_edit_time)
     VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
    [uid, setting.age_min, setting.age_max, 150, 200, null, '', 'self values text long enough aaaaa', 'target values text long enough aaaaa']
  );
  return uid;
}

async function logsFor(uid, date) {
  const [rows] = await pool.query('SELECT user_id,match_user_id FROM user_match_log WHERE user_id=? AND match_date=?', [uid, date]);
  return rows;
}

(async () => {
  const date = '2026-07-01';
  await pool.query('DELETE FROM user_match_log WHERE match_date=?', [date]);
  // A: VIP 男，想要 25-35 岁；  B: 非VIP 女，想要 25-35 岁 → 互相满足
  const A = await seedUser('wave2_A', 1, true,  { age_min: 25, age_max: 35 });
  const B = await seedUser('wave2_B', 2, false, { age_min: 25, age_max: 35 });
  // C: VIP 男；  D: 非VIP 女，只接受 18-22 岁（A/C 都 ~31 岁 → D 不满足 A/C）
  const C = await seedUser('wave2_C', 1, true,  { age_min: 25, age_max: 35 });
  const D = await seedUser('wave2_D', 2, false, { age_min: 18, age_max: 22 });

  const res = await runBatchMatch(date, '周三');
  console.log('runBatchMatch =>', res);

  const la = await logsFor(A, date), lb = await logsFor(B, date);
  const lc = await logsFor(C, date), ld = await logsFor(D, date);
  const ok = (name, cond) => console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);

  ok('A(VIP) 配到 B(非VIP) —— 候选放开非VIP', la.some(x => x.match_user_id === B));
  ok('B 拿到对称记录指向 A —— 双向对称写入', lb.some(x => x.match_user_id === A));
  ok('A 本批次仅 1 条 —— 每人≤1', la.length === 1);
  ok('B 本批次仅 1 条 —— 每人≤1', lb.length === 1);
  ok('D 未与任何人配对 —— 双向不满足不配', ld.length === 0);
  ok('C 因唯一可选女(D)不满足 → 无记录', lc.length === 0);

  // 清理
  await pool.query('DELETE FROM user_match_log WHERE match_date=?', [date]);
  for (const oid of ['wave2_A','wave2_B','wave2_C','wave2_D']) {
    await pool.query("DELETE ms FROM user_match_setting ms JOIN `user` u ON u.id=ms.user_id WHERE u.openid=?", [oid]);
    await pool.query('DELETE FROM `user` WHERE openid=?', [oid]);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2 运行**：

Run: `cd server && node test-wave2-match.js`
Expected: 6 行全部 `PASS`。若某条 FAIL：先看是否 `MIN_SIDE_SCORE` 门槛过高/过低（Task 1.2 调整），再重跑。

- [ ] **Step 3**：验收通过后删除脚本并提交：

```bash
git rm server/test-wave2-match.js
git commit -m "test(match): verify bidirectional matching (temp script, removed after pass)"
```

---

## Phase 2 — 非VIP模糊 + 详情字段收紧

> 现状：`/api/match/latest|list|detail|:id` 全部挂 `requireVip`，非 VIP 直接 403。改为：**非 VIP 也能调用，但只拿"有匹配 + 开通引导"的模糊数据**；VIP 拿收紧后的完整字段。

### Task 2.1：match.js —— 去 requireVip，改为按 VIP 分级返回 + 字段收紧

**Files：** Modify `server/src/routes/match.js`

- [ ] **Step 1**：顶部已 `require` 了 `requireVip`、`isVipActive`？确认 import。`match.js` 第 4-9 行从 guard 引入了 `requireActiveUser, requireVip, debounceMiddleware, daysSince`。把 `isVipActive`、`loadUser` 也引入：

```js
const {
  requireActiveUser,
  requireVip,
  debounceMiddleware,
  daysSince,
  isVipActive,
  loadUser,
} = require('../middleware/guard');
```

- [ ] **Step 2**：加一个「年龄段」helper（顶部 `formatMatchItem` 之前）：

```js
function ageBand(birthYear) {
  if (!birthYear) return '';
  const age = new Date().getFullYear() - Number(birthYear);
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 5}岁`;
}
```

- [ ] **Step 3**：改写 `loadMatchDetail`（约 286-338 行）为按 VIP 分级 + 收紧字段（去掉 gender/city/精确身高，年龄改年龄段）：

```js
async function loadMatchDetail(req, res, next, matchId) {
  try {
    const [rows] = await pool.query(
      `SELECT ml.*, u.gender, u.birth_year, u.education,
              u.circle_id, u.baby_plan, oc.circle_name
       FROM user_match_log ml
       JOIN \`user\` u ON u.id = ml.match_user_id
       LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
       WHERE ml.id = ? AND ml.user_id = ?`,
      [matchId, req.auth.id]
    );
    if (rows.length === 0) return fail(res, '匹配记录不存在', 404, 404);
    const match = rows[0];

    const me = req.user || (await loadUser(req.auth.id));
    const vip = isVipActive(me);

    if (!vip) {
      // 非 VIP：模糊态 + 开通引导（Q1）
      return success(res, {
        id: match.id,
        matchId: match.id,
        match_date: match.match_date,
        match_type: match.match_type,
        locked: true,
        view_similarity: null,
        message: '你有一位匹配对象，开通 VIP 查看完整匹配详情',
      });
    }

    // VIP：收紧为最小集（年龄段/学历/职业圈层/婚育/契合度；不含性别/城市/身高）
    return success(res, {
      id: match.id,
      matchId: match.id,
      match_date: match.match_date,
      match_type: match.match_type,
      locked: false,
      view_similarity: match.view_similarity,
      compatibilityScore: match.view_similarity,
      age_band: ageBand(match.birth_year),
      education: match.education,
      circle_name: match.circle_name,
      baby_plan: match.baby_plan,
    });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4**：把 `/latest`、`/list`、`/detail`、`/:id` 四个路由的 `requireVip` 去掉（让非 VIP 也能进，分级在 handler 内做）。例如：

```js
router.get('/latest', async (req, res, next) => {   // 原: ('/latest', requireVip, ...)
```
对 `/detail`、`/:id` 同样去掉 `requireVip`。

- [ ] **Step 5**：`/latest` 与 `/list` 也要对非 VIP 返回模糊：把它们用的 `formatMatchItem` 改为接收 vip 标志并收紧/模糊。替换 `formatMatchItem`（约 62-82 行）：

```js
function formatMatchItem(row, vip) {
  if (!vip) {
    return {
      id: row.id, matchId: row.id, status: 'matched', locked: true,
      match_date: row.match_date, match_type: row.match_type,
      view_similarity: null,
    };
  }
  return {
    id: row.id, matchId: row.id, status: 'matched', locked: false,
    match_date: row.match_date, match_type: row.match_type,
    view_similarity: row.view_similarity,
    compatibilityScore: row.view_similarity,
    age_band: ageBand(row.birth_year),
    education: row.education,
    circle_name: row.circle_name,
    baby_plan: row.baby_plan,
  };
}
```

- [ ] **Step 6**：在 `/latest` 和 `/list` 里取得 vip 标志并传入。`/latest`：在查询后、`formatMatchItem` 调用处改为：

```js
    const me = req.user || (await loadUser(req.auth.id));
    const vip = isVipActive(me);
    if (rows.length === 0) return success(res, null);
    return success(res, formatMatchItem(rows[0], vip));
```
`/list`：`const list = rows.map((r) => formatMatchItem(r, vip));`（在 map 前同样取 `vip`）。
> 这两个 SELECT 现在仍 SELECT 了 gender/city/height_range，但 `formatMatchItem` 不再透出它们；可保留 SELECT 不动以降低改动面。

- [ ] **Step 7 语法检查 + 提交**：

```bash
node --check server/src/routes/match.js
git add server/src/routes/match.js
git commit -m "feat(match): non-VIP blurred view + tighten detail fields to PRD minimal set"
```

### Task 2.2：前端 match-detail —— 模糊态 + 收紧标签

**Files：** Modify `miniprogram/pages/match-detail/match-detail.js` 与 `.wxml`

- [ ] **Step 1**：`match-detail.js` 的 `loadDetail` 里，处理 `locked` 与新字段。把 `normalized` 构造（约 50-64 行）替换为：

```js
      const locked = !!detail.locked
      const score = detail.view_similarity ?? detail.compatibilityScore
      const hasScore = !locked && score !== null && score !== undefined && score > 0

      const normalized = {
        locked,
        ageBand: detail.age_band || '',
        education: detail.education || '--',
        babyPlan: detail.baby_plan || '--',
        circleName: detail.circle_name || '--',
        matchType: detail.match_type || '',
        matchDate: detail.match_date || '',
        lockMsg: detail.message || '开通 VIP 查看完整匹配详情'
      }
```
并把后面的 `compatibilityScore`/`hasScore`/`progressColor` 等 setData 用上面的 `hasScore`/`score`（删除旧的 gender/city/height/age 字段引用）。

- [ ] **Step 2**：`match-detail.wxml` 把 profile-tags 块（39-47 行）替换为收紧字段 + 模糊态：

```xml
      <view class="profile-tags" wx:if="{{!detail.locked}}">
        <text class="tag tag-gray">{{detail.ageBand}}</text>
        <text class="tag tag-gray">{{detail.education}}</text>
        <text class="tag tag-pink">{{detail.circleName}}</text>
        <text class="tag tag-gray">{{detail.babyPlan}}</text>
      </view>
      <view class="lock-hint" wx:else>
        <text>🔒 {{detail.lockMsg}}</text>
        <navigator url="/pages/vip/vip" class="btn-primary btn-sm">开通 VIP</navigator>
      </view>
```
> 复用已有 `.tag`/`.btn-primary` 样式，不新增设计系统类（`.lock-hint` 可加最简定位样式到本页 wxss）。契合度卡（compat-card）在 `locked` 时因 `hasScore=false` 自动走"暂无契合度"分支，无需另改。

- [ ] **Step 3 提交**：

```bash
git add miniprogram/pages/match-detail/
git commit -m "feat(match-detail): blurred state for non-VIP + tightened field tags"
```

### Task 2.3：验收（curl，VIP vs 非VIP）

- [ ] **Step 1**：确保后端在跑（`cd server && node src/app.js`，连 Docker MySQL）。用下面脚本造数据并验证（PowerShell 用 `Get-Content`-管道法或在 Git Bash 跑）：

```bash
BASE=http://localhost:3000
Q(){ docker exec wefinally-mysql mysql -uroot -pwefinally123 wefinally -N -e "$1" 2>/dev/null; }
SECRET=$(grep '^JWT_SECRET=' server/.env | cut -d= -f2)
# 造 VIP 用户 V 与 非VIP 用户 N，并给 V 造一条 match_log
Q "DELETE FROM \`user\` WHERE openid IN ('wv_v','wv_n');"
Q "INSERT INTO \`user\`(openid,gender,birth_year,height_range,education,circle_id,marry_status,baby_plan,status,is_vip,vip_expire_time) VALUES ('wv_v',1,1995,'175cm','BK',1,'single','3-5y',1,1,DATE_ADD(NOW(),INTERVAL 30 DAY)),('wv_n',1,1995,'175cm','BK',1,'single','3-5y',1,0,NULL);"
V=$(Q "SELECT id FROM \`user\` WHERE openid='wv_v';"); N=$(Q "SELECT id FROM \`user\` WHERE openid='wv_n';")
Q "INSERT INTO user_match_log(user_id,match_user_id,view_similarity,match_date,match_type) VALUES ($V,$N,77,'2026-07-01','周三'),($N,$V,77,'2026-07-01','周三');"
MV=$(Q "SELECT id FROM user_match_log WHERE user_id=$V LIMIT 1;"); MN=$(Q "SELECT id FROM user_match_log WHERE user_id=$N LIMIT 1;")
TV=$(cd server && node -e "console.log(require('jsonwebtoken').sign({id:$V,role:'user',openid:'wv_v'},'$SECRET',{expiresIn:'1h'}))")
TN=$(cd server && node -e "console.log(require('jsonwebtoken').sign({id:$N,role:'user',openid:'wv_n'},'$SECRET',{expiresIn:'1h'}))")
echo "--- VIP 看详情（应 locked=false + age_band/无gender/city/height）---"
curl -s "$BASE/api/match/detail?id=$MV" -H "Authorization: Bearer $TV"; echo ""
echo "--- 非VIP 看详情（应 locked=true + message，无资料字段）---"
curl -s "$BASE/api/match/detail?id=$MN" -H "Authorization: Bearer $TN"; echo ""
# 清理
Q "DELETE FROM user_match_log WHERE match_date='2026-07-01'; DELETE FROM \`user\` WHERE openid IN ('wv_v','wv_n');"
```
Expected：VIP 返回里 `locked:false`、有 `age_band/education/circle_name/baby_plan`、**无 gender/city/height_range**；非 VIP 返回 `locked:true` + `message`、无资料字段。

---

## 本波「不做」（留后续 plan）
- **身高区间 + 旧数据迁移**（register UI + 分桶 + 迁移 + matchService parseHeightCm 中位数）→ 独立 `fix/height-range` 计划；落地后再把身高区间加回详情展示。
- 外貌描述、见面安全、R2 配置化收敛。
- `index`/`match-list` 前端对 locked 态的展示美化（本波后端已对 `/latest`、`/list` 返回 `locked` 字段；前端如何呈现可在体验补缺里做）。

## GPT Review 检查表
**正确性**
- [ ] 候选放开：非 VIP（有择偶设置）可作为候选被配到
- [ ] 双向：仅双方互相满足才配；不满足方不配（test 脚本 D/C 为 0 条）
- [ ] 对称：配成后双方各 1 条、指向对方、同分同批次
- [ ] 每人每批次 ≤1 条
- [ ] 非 VIP 调 detail/latest/list 返回 `locked:true` + 引导，**不泄露**对方资料
- [ ] VIP detail 不再含 gender/city/精确身高；年龄为"年龄段"
**范围纪律**
- [ ] 未改分润/支付/cron 节奏/init.sql 结构/app.wxss
- [ ] 未新增依赖；matchService 权重未被顺手重构（保持 inline）
- [ ] 每 Task 有独立 commit；临时测试脚本已删除
**回归**
- [ ] `node --check` 通过；`node src/app.js` 正常启动
- [ ] VIP 正常匹配链路（造数据→detail）无报错

> 完成后把结果记入 `project-docs/DEVELOPMENT_LOG.md`（新增「第 2 波：双向互配 + 非VIP分级」条目），实际与计划不符处以代码为准并注明。
