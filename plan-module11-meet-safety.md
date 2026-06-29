# 模块11 实施计划 · 见面安全（110 方案一）

> 执行：Cursor(GPT-5.5)+Composer → GPT 对照文末检查表 review。
> 前置：本地 MySQL 在跑、后端能启动。来源：老板 A7 + `MODULES/11`。
> 已定型(老板/John 拍板)：方案一**全做**；一键呼救 = **拨110 + 定位展示 + 通知紧急联系人**；跳广东110 用 config 留代码位(拿到授权再开)；**暂无短信商/暂无24h客服** → 内部预警先"记录 + 引导用户自联紧急联系人"，不假装能自动短信。

**Goal**：见面报备(含 LBS) + 历史 + 见面安全卡(脱敏可转发) + 一键呼救(拨110+定位+记录SOS+引导联系紧急联系人)。

**不做(YAGNI/合规)**：直连/直推公安、自动短信/推送(无服务商)、24h客服值守(无人力)、地图逆地理编码(地址用户自填，只采经纬度作证据)。→ skipped，拿到资源/服务商再加。

## 约束
- 代码根目录 `D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\`
- LBS 必须**用户主动授权**、仅报备/呼救用，禁后台静默采集（个保法）。
- 不宣称"直连110"。不改 init.sql 结构（新 patch）。复用 app.wxss，不重做设计系统。

---

## Task 1：DB —— meet_report + sos_log

**Files:** Create `database/patch-005-meet-report.sql`

- [ ] Step 1：

```sql
USE wefinally;

CREATE TABLE IF NOT EXISTS `meet_report` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `match_user_id` int DEFAULT 0 COMMENT '见面对象(可空)',
  `meet_time` datetime NULL,
  `meet_place` varchar(200) DEFAULT '' COMMENT '用户填写地点',
  `lat` decimal(10,6) DEFAULT NULL,
  `lng` decimal(10,6) DEFAULT NULL,
  `meet_note` varchar(500) DEFAULT '',
  `emergency_contact` varchar(30) DEFAULT '' COMMENT '紧急联系人手机号',
  `safety_ack` tinyint DEFAULT 0 COMMENT '已读安全提示',
  `status` tinyint DEFAULT 0 COMMENT '0进行中1已结束2已取消',
  `card_no` varchar(40) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线下见面报备';

CREATE TABLE IF NOT EXISTS `sos_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `meet_report_id` int DEFAULT 0,
  `lat` decimal(10,6) DEFAULT NULL,
  `lng` decimal(10,6) DEFAULT NULL,
  `emergency_contact` varchar(30) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一键呼救记录(证据链)';
```

- [ ] Step 2 导入 + 验收 `SHOW TABLES LIKE 'meet_report'; SHOW TABLES LIKE 'sos_log';`
- [ ] Step 3 `git add database/patch-005-meet-report.sql && git commit -m "feat(db): meet_report + sos_log"`

## Task 2：safetyConfig

**Files:** Create `server/src/config/safetyConfig.js`

```js
module.exports = {
  meetSafetyEnabled: true,
  meetNoteMaxLen: 500,
  emergencyContactRequired: true,
  sosPhone: '110',
  safetyTipsText: '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。',
  // 拿到「广东110」官方小程序跳转授权后：enabled:true + 填 appId/path 即启用，不改其它代码
  guangdong110: { enabled: false, appId: '', path: '' },
  cardValidHours: 24,
};
```
- [ ] commit `feat(config): safetyConfig with guangdong110 hook (off)`

## Task 3：后端 meet.js（report CRUD + SOS）

**Files:** Create `server/src/routes/meet.js`；Modify `server/src/app.js`（挂载）

- [ ] Step 1 `server/src/routes/meet.js`：

```js
const express = require('express');
const pool = require('../config/db');
const { userAuth } = require('../middleware/auth');
const { requireActiveUser } = require('../middleware/guard');
const { success, fail } = require('../utils/response');
const cfg = require('../config/safetyConfig');

const router = express.Router();
router.use(userAuth, requireActiveUser);

/** POST /api/meet/create */
router.post('/create', async (req, res, next) => {
  try {
    const { match_user_id, meet_time, meet_place, lat, lng, meet_note, emergency_contact, safety_ack } = req.body;
    if (!safety_ack) return fail(res, '请先阅读并勾选安全提示');
    if (cfg.emergencyContactRequired && !/^\d{11}$/.test(String(emergency_contact || '')))
      return fail(res, '请填写有效的紧急联系人手机号');
    const cardNo = 'MC' + Date.now().toString(36).toUpperCase();
    const [r] = await pool.query(
      `INSERT INTO meet_report
       (user_id, match_user_id, meet_time, meet_place, lat, lng, meet_note, emergency_contact, safety_ack, status, card_no)
       VALUES (?,?,?,?,?,?,?,?,1,0,?)`,
      [req.auth.id, Number(match_user_id) || 0, meet_time || null, String(meet_place || '').slice(0, 200),
       lat ?? null, lng ?? null, String(meet_note || '').slice(0, cfg.meetNoteMaxLen),
       String(emergency_contact || ''), cardNo]
    );
    return success(res, { id: r.insertId, card_no: cardNo }, '见面报备已保存');
  } catch (err) { next(err); }
});

/** GET /api/meet/list — 本人历史 */
router.get('/list', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, match_user_id, meet_time, meet_place, status, card_no, create_time FROM meet_report WHERE user_id = ? ORDER BY id DESC LIMIT 50',
      [req.auth.id]
    );
    return success(res, rows);
  } catch (err) { next(err); }
});

/** GET /api/meet/:id — 本人单条(含安全卡字段) */
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM meet_report WHERE id = ? AND user_id = ?', [Number(req.params.id), req.auth.id]
    );
    if (rows.length === 0) return fail(res, '记录不存在', 404, 404);
    return success(res, rows[0]);
  } catch (err) { next(err); }
});

/** POST /api/meet/:id/cancel */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    await pool.query('UPDATE meet_report SET status = 2 WHERE id = ? AND user_id = ?', [Number(req.params.id), req.auth.id]);
    return success(res, null, '已取消');
  } catch (err) { next(err); }
});

/** POST /api/meet/:id/sos — 一键呼救：记录证据(前端随后 makePhoneCall 拨110) */
router.post('/:id/sos', async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const [m] = await pool.query('SELECT emergency_contact FROM meet_report WHERE id = ? AND user_id = ?', [Number(req.params.id), req.auth.id]);
    const contact = m.length ? m[0].emergency_contact : '';
    await pool.query(
      'INSERT INTO sos_log (user_id, meet_report_id, lat, lng, emergency_contact) VALUES (?,?,?,?,?)',
      [req.auth.id, Number(req.params.id) || 0, lat ?? null, lng ?? null, contact]
    );
    // ponytail: 无短信商/无客服值守 → 仅落证据 + 回传紧急联系人给前端引导用户自联；接入短信后在此发送
    return success(res, { sosPhone: cfg.sosPhone, emergency_contact: contact }, 'SOS 已记录');
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] Step 2 app.js 挂载（仿其它路由）：在 `app.use('/api/report', reportRoutes);` 附近加
```js
const meetRoutes = require('./routes/meet');
app.use('/api/meet', meetRoutes);
```
- [ ] Step 3 `node --check server/src/routes/meet.js server/src/app.js`
- [ ] Step 4 commit `feat(meet): report CRUD + SOS endpoints`

## Task 4：前端页面（复用现有样式）

**Files:** Create `miniprogram/pages/meet-safety/`、`miniprogram/pages/meet-safety-list/`；Modify `app.json`、`match-detail`、`profile`

- [ ] Step 1 `app.json`：`pages` 加两页；并加 LBS 权限：
```json
"permission": { "scope.userLocation": { "desc": "用于线下见面报备与一键呼救定位，仅在你主动操作时使用" } },
"requiredPrivateInfos": ["getLocation"]
```
- [ ] Step 2 `pages/meet-safety`（报备表单 + 提交后显示安全卡/呼救）。**关键 JS**（wxml 复用 register 的 picker + match-setting 的 textarea + agreement 的 checkbox；wxss 复用 app.wxss .card/.btn-primary/.form-item）：
```js
const { post } = require('../../utils/request')
Page({
  data: { form: { match_user_id:0, meet_time:'', meet_place:'', lat:null, lng:null, meet_note:'', emergency_contact:'' }, ack:false, created:null },
  onLoad(o){ if(o.matchUserId) this.setData({'form.match_user_id': Number(o.matchUserId)}) },
  getLoc(){
    wx.getLocation({ type:'gcj02',
      success:r=>{ this.setData({'form.lat':r.latitude,'form.lng':r.longitude}); wx.showToast({title:'定位已获取',icon:'success'}) },
      fail:()=> wx.showModal({title:'需要定位授权',content:'请在设置中允许位置权限',showCancel:false})
    })
  },
  onInput(e){ this.setData({['form.'+e.currentTarget.dataset.k]: e.detail.value}) },
  toggleAck(){ this.setData({ ack: !this.data.ack }) },
  async submit(){
    if(!this.data.ack) return wx.showToast({title:'请勾选安全提示',icon:'none'})
    try{
      const d = await post('/api/meet/create', {...this.data.form, safety_ack:1}, {showLoading:true})
      this.setData({ created: d }); wx.showToast({title:'已报备',icon:'success'})
    }catch(e){ wx.showModal({title:'失败',content:(e&&e.message)||'',showCancel:false}) }
  },
  async sos(){
    const id = this.data.created && this.data.created.id; if(!id) return
    const { lat, lng } = this.data.form
    let r = {}
    try{ r = await post(`/api/meet/${id}/sos`, { lat, lng }) }catch(e){}
    wx.makePhoneCall({ phoneNumber: (r && r.sosPhone) || '110' })
    if(r && r.emergency_contact) wx.showModal({title:'同时联系紧急联系人', content:r.emergency_contact, showCancel:false})
  },
  onShareAppMessage(){ const c=this.data.created||{}; return { title:`我已报备线下见面(安全卡 ${c.card_no||''})`, path:'/pages/welcome/welcome' } }
})
```
> 安全卡 = 提交成功后用 `.card` 展示脱敏字段(对象/时间/地点/卡号/安全提示) + `<button open-type="share">转发给信任的人</button>` + 醒目「🆘 一键呼救」按钮 `bindtap="sos"`。

- [ ] Step 3 `pages/meet-safety-list`：拉 `/api/meet/list`，复用 match-list 整页结构展示历史(地点/时间/状态 tag)，点项跳 meet-safety 查看。
- [ ] Step 4 入口：`match-detail` 的 `.meet-card` 内加按钮 `<navigator url="/pages/meet-safety/meet-safety?matchUserId={{...}}">线下见面安全确认</navigator>`；`profile.menuList` 加「见面安全记录」→ meet-safety-list。
- [ ] Step 5 commit `feat(meet): safety report form, history, SOS, share entry`

## Task 5：验收

**后端(curl，可自动)**：
```bash
BASE=http://localhost:3000; SECRET=$(grep '^JWT_SECRET=' server/.env | cut -d= -f2)
Q(){ docker exec wefinally-mysql mysql -uroot -pwefinally123 wefinally -N -e "$1" 2>/dev/null; }
Q "DELETE FROM \`user\` WHERE openid='ms1';"
Q "INSERT INTO \`user\`(openid,gender,birth_year,height_range,education,circle_id,marry_status,baby_plan,status) VALUES ('ms1',1,1995,'170-180cm','BK',1,'single','3-5y',1);"
U=$(Q "SELECT id FROM \`user\` WHERE openid='ms1';")
T=$(cd server && node -e "console.log(require('jsonwebtoken').sign({id:$U,role:'user',openid:'ms1'},'$SECRET',{expiresIn:'1h'}))")
echo "缺安全勾选应失败:"; curl -s -X POST "$BASE/api/meet/create" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"meet_place":"X","emergency_contact":"13800000000"}'; echo ""
echo "正常创建:"; ID=$(curl -s -X POST "$BASE/api/meet/create" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"meet_place":"咖啡店","lat":22.5,"lng":114.0,"emergency_contact":"13800000000","safety_ack":1}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify(j.data));process.stderr.write(String(j.data.id))}" 2>/tmp/mid); cat /tmp/mid); echo ""
MID=$(cat /tmp/mid)
echo "SOS:"; curl -s -X POST "$BASE/api/meet/$MID/sos" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"lat":22.5,"lng":114.0}'; echo ""
echo "list:"; curl -s "$BASE/api/meet/list" -H "Authorization: Bearer $T"; echo ""
Q "DELETE FROM sos_log WHERE user_id=$U; DELETE FROM meet_report WHERE user_id=$U; DELETE FROM \`user\` WHERE openid='ms1';"
```
Expected：缺勾选→fail；创建→返回 id+card_no；SOS→返回 sosPhone:110+紧急联系人；list 有 1 条。

**前端(手动·微信开发者工具)**：报备页能取定位(getLocation 授权)、提交出安全卡、转发可用、🆘 拨110 弹窗、历史列表显示。（getLocation/makePhoneCall 无法 curl，需工具内点。）

## GPT Review 检查表
- [ ] 安全勾选/紧急联系人校验生效；create 返回 card_no
- [ ] SOS 落 sos_log（证据链）；返回 sosPhone+紧急联系人；前端 makePhoneCall 拨110
- [ ] LBS 仅在用户点「获取定位」时 getLocation，无后台静默采集；app.json 有 permission 描述
- [ ] guangdong110 开关默认 false，未启用跳转；无"直连110"宣传文案
- [ ] 安全卡脱敏(不含手机号/真实姓名)；转发 open-type=share 可用
- [ ] 仅本人可读/改自己的 meet_report（SQL 均带 user_id）
- [ ] 未改 init.sql 结构/分润/支付；每 Task 有 commit
