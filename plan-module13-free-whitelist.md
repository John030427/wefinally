# 模块13 实施计划 · 批量导入 + 公职/教师/医护免费白名单（v1 = 先留好接口）

> 执行：Cursor(GPT-5.5) + Composer 实现 → GPT 对照文末检查表 review。
> 前置：本地 MySQL(Docker `wefinally-mysql`) 在跑、后端能启动（见 plan.md 第1波）。
> 来源：老板 A8「让三大人群批量导入，免费，先留好接口」。详见 `project-docs/MODULES/13-批量导入与公职白名单.md`。

**Goal**：单位脱敏名单**批量导入** → 命中者**终身免费会员**(豁免188) + 圈层来源标记。v1 只做"接口 + 数据 + 领取 + 免费生效"，单位自助门户/审核UI 等有真实对接再做。

**不做(YAGNI)**：单位自助上传门户、模式二个人证件人工审核、招商数据看板。→ skipped，有真实单位对接再加。

## 约束
- 代码根目录：`D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\`
- 合规红线(写进实现)：**平台只接收、不私自采集**；脱敏名单加密/受控；仅管理员导入。
- 不改 init.sql 结构（加列走新 patch）。`user` 当前**无 phone 列**——领取走"用户登录后自报手机号匹配白名单"(老板已确认 W-3 思路)。

---

## Task 1：DB —— 白名单表 + user 免费字段

**Files:** Create `database/patch-004-free-whitelist.sql`

- [ ] Step 1 写文件：

```sql
USE wefinally;

-- 单位脱敏白名单（平台只接收，不自采）
CREATE TABLE IF NOT EXISTS `free_whitelist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL,
  `name` varchar(50) DEFAULT '',
  `unit` varchar(100) DEFAULT '' COMMENT '提交单位',
  `source` varchar(20) NOT NULL COMMENT 'public公职/edu教师/med医护',
  `used` tinyint DEFAULT 0 COMMENT '0未领取1已领取',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公职/教师/医护免费白名单';

-- user 免费会员标记
ALTER TABLE `user` ADD COLUMN `free_member` tinyint NOT NULL DEFAULT 0 COMMENT '1=公益免费会员(永久豁免188)';
ALTER TABLE `user` ADD COLUMN `free_source` varchar(20) NOT NULL DEFAULT '' COMMENT 'public/edu/med';
```

- [ ] Step 2 导入：`docker exec -i wefinally-mysql mysql -uroot -pwefinally123 wefinally < database/patch-004-free-whitelist.sql`
- [ ] Step 3 验收：`docker exec wefinally-mysql mysql -uroot -pwefinally123 wefinally -e "SHOW COLUMNS FROM user LIKE 'free%'; SHOW TABLES LIKE 'free_whitelist';"` → 看到 free_member/free_source + free_whitelist。
- [ ] Step 4 提交：`git add database/patch-004-free-whitelist.sql && git commit -m "feat(db): free_whitelist table + user free_member fields"`

## Task 2：免费会员豁免逻辑（一行，根因处）

**Files:** Modify `server/src/middleware/guard.js`

- [ ] Step 1 在 `isVipActive` 函数最上面加一行（免费会员永远算 VIP）：

```js
function isVipActive(user) {
  if (user && user.free_member) return true; // 公益免费会员：永久豁免
  if (!user || user.is_vip !== 1) return false;
  if (!user.vip_expire_time) return false;
  return new Date(user.vip_expire_time) > new Date();
}
```
> 根因处改一次，所有 requireVip / 匹配 / 详情 都自动认这个免费身份，不用各处补。

- [ ] Step 2 `node --check server/src/middleware/guard.js`
- [ ] Step 3 提交：`git commit -am "feat(member): free_member counts as active VIP"`

## Task 3：管理员批量导入 API（这就是老板要的"接口"）

**Files:** Modify `server/src/routes/admin.js`（router 已 `router.use(adminAuth)`）

- [ ] Step 1 在 admin.js 末尾 `module.exports` 之前加：

```js
/** POST /api/admin/whitelist/import — 批量导入脱敏白名单（幂等，按 phone 去重） */
router.post('/whitelist/import', async (req, res, next) => {
  try {
    const list = Array.isArray(req.body.list) ? req.body.list : [];
    const ok = ['public', 'edu', 'med'];
    let inserted = 0;
    for (const r of list) {
      const phone = String(r.phone || '').trim();
      const source = ok.includes(r.source) ? r.source : 'public';
      if (!/^\d{11}$/.test(phone)) continue; // ponytail: 只收 11 位手机号，脏数据跳过
      await pool.query(
        `INSERT INTO free_whitelist (phone, name, unit, source) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), unit=VALUES(unit), source=VALUES(source)`,
        [phone, String(r.name || '').slice(0, 50), String(r.unit || '').slice(0, 100), source]
      );
      inserted += 1;
    }
    return success(res, { received: list.length, imported: inserted });
  } catch (err) { next(err); }
});
```
> v1 用 JSON 数组导入（管理员用 Postman/脚本即可，老板要的是"接口先留好"）。CSV 上传 UI 二期。

- [ ] Step 2 `node --check server/src/routes/admin.js`
- [ ] Step 3 提交：`git commit -am "feat(admin): batch whitelist import API"`

## Task 4：用户领取免费身份（手机号匹配白名单，W-3）

**Files:** Modify `server/src/routes/user.js`（router 已 `userAuth, requireActiveUser`）

- [ ] Step 1 在 user.js 末尾 `module.exports` 之前加：

```js
/** POST /api/user/claim-free — 登录用户自报手机号，命中白名单则开通终身免费会员 */
router.post(
  '/claim-free',
  debounceMiddleware((req) => `claim-free:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const phone = String(req.body.phone || '').trim();
      if (!/^\d{11}$/.test(phone)) return fail(res, '请输入正确的手机号');
      const [rows] = await pool.query(
        'SELECT * FROM free_whitelist WHERE phone = ? LIMIT 1',
        [phone]
      );
      if (rows.length === 0) return fail(res, '该手机号不在公益免费名单内');
      const wl = rows[0];
      await pool.query(
        'UPDATE `user` SET free_member = 1, free_source = ? WHERE id = ?',
        [wl.source, req.auth.id]
      );
      await pool.query('UPDATE free_whitelist SET used = 1 WHERE id = ?', [wl.id]);
      return success(res, { free_source: wl.source }, '已开通公益免费会员');
    } catch (err) { next(err); }
  }
);
```

- [ ] Step 2 GET `/profile` 返回里带上 `free_member`、`free_source`（在 `buildProfilePayload` 加这两字段；若是字段白名单，确保包含），供前端显示标签。
- [ ] Step 3 `node --check server/src/routes/user.js`
- [ ] Step 4 提交：`git commit -am "feat(user): claim-free by phone against whitelist"`

## Task 5：前端入口（零新页，复用 showModal）

**Files:** Modify `miniprogram/pages/profile/profile.js` + `.wxml`

- [ ] Step 1 profile.js 加方法（点菜单 → 输手机号 → 领取）：

```js
  onClaimFree() {
    wx.showModal({
      title: '公益免费认证',
      editable: true,
      placeholderText: '输入单位登记的手机号',
      success: async (r) => {
        if (!r.confirm) return
        try {
          const { post } = require('../../utils/request')
          await post('/api/user/claim-free', { phone: (r.content || '').trim() }, { showLoading: true })
          wx.showToast({ title: '已开通免费会员', icon: 'success' })
          this.loadProfile()
        } catch (e) {
          wx.showModal({ title: '认证失败', content: (e && e.message) || '手机号不在名单内', showCancel: false })
        }
      }
    })
  },
```
> ponytail：用 `wx.showModal({editable:true})` 的单输入框，省一个新页面。

- [ ] Step 2 profile.wxml 在菜单区加一项（复用现有 menu-item 结构）：
```xml
<view class="menu-item" bindtap="onClaimFree">
  <text class="menu-icon">🎖️</text><text class="menu-title">公益免费认证</text>
</view>
```
（若用户已 `free_member`，可显示已认证标签 `{{userInfo.free_source}}`，非必须。）

- [ ] Step 3 提交：`git commit -am "feat(profile): public-welfare free claim entry"`

## Task 6：验收（curl，端到端）

- [ ] 后端在跑。Git Bash 执行：

```bash
BASE=http://localhost:3000
Q(){ docker exec wefinally-mysql mysql -uroot -pwefinally123 wefinally -N -e "$1" 2>/dev/null; }
SECRET=$(grep '^JWT_SECRET=' server/.env | cut -d= -f2)
# 管理员导入白名单
AT=$(curl -s -X POST "$BASE/api/auth/admin-login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123456"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.token))")
curl -s -X POST "$BASE/api/admin/whitelist/import" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d '{"list":[{"phone":"13800000001","name":"T","unit":"某局","source":"public"}]}'; echo ""
# 造个登录用户，领取
Q "DELETE FROM \`user\` WHERE openid='cf1';"
Q "INSERT INTO \`user\`(openid,gender,birth_year,height_range,education,circle_id,marry_status,baby_plan,status) VALUES ('cf1',1,1995,'170-180cm','BK',1,'single','3-5y',1);"
U=$(Q "SELECT id FROM \`user\` WHERE openid='cf1';")
UT=$(cd server && node -e "console.log(require('jsonwebtoken').sign({id:$U,role:'user',openid:'cf1'},'$SECRET',{expiresIn:'1h'}))")
echo "命中:"; curl -s -X POST "$BASE/api/user/claim-free" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" -d '{"phone":"13800000001"}'; echo ""
echo "free_member=$(Q "SELECT free_member,free_source FROM \`user\` WHERE id=$U;")  (期望 1 public)"
echo "未命中:"; curl -s -X POST "$BASE/api/user/claim-free" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" -d '{"phone":"13900000009"}'; echo ""
Q "DELETE FROM \`user\` WHERE openid='cf1'; DELETE FROM free_whitelist WHERE phone='13800000001';"
```
Expected：导入 imported:1；命中 → "已开通"、free_member=1 public；未命中 → fail "不在名单内"。

## GPT Review 检查表
- [ ] 导入幂等(同 phone 再导更新不报错)、非法手机号跳过
- [ ] claim 命中→free_member=1、白名单 used=1；未命中→失败且不改 user
- [ ] free_member 用户 isVipActive=true（可造数据 + 调 /api/match/latest 不再 403）
- [ ] 合规：导入仅 adminAuth；平台不自采（无爬取/外部抓取代码）
- [ ] 未改 init.sql 结构、未动分润/支付、每 Task 有 commit
