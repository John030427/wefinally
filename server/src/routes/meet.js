const express = require('express');
const { randomUUID } = require('crypto');
const pool = require('../config/db');
const { userAuth } = require('../middleware/auth');
const { requireActiveUser } = require('../middleware/guard');
const { success, fail } = require('../utils/response');
const cfg = require('../config/safetyConfig');

const router = express.Router();

function normalizeMeetTime(value) {
  const raw = String(value || '').trim().replace(/：/g, ':');
  if (!raw) return null;
  const m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return false;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = m;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
    || date.getHours() !== Number(hour)
    || date.getMinutes() !== Number(minute)
  ) {
    return false;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function normalizeLocation(lat, lng, required = false) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return required ? null : { lat: null, lng: null };
  }
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
    return required ? null : { lat: null, lng: null };
  }
  return { lat: nLat, lng: nLng };
}

function guangdong110Payload() {
  return {
    enabled: Boolean(cfg.guangdong110?.enabled && cfg.guangdong110?.appId),
    appId: cfg.guangdong110?.appId || '',
    path: cfg.guangdong110?.path || '',
  };
}

async function latestLocation(userId, meetReportId) {
  const [rows] = await pool.query(
    `SELECT lat, lng
     FROM meet_location_log
     WHERE user_id = ? AND meet_report_id = ?
     ORDER BY id DESC LIMIT 1`,
    [userId, meetReportId]
  );
  return rows[0] || {};
}

async function insertSosLog({ userId, meetReportId, lat, lng, emergencyContact }) {
  await pool.query(
    'INSERT INTO sos_log (user_id, meet_report_id, lat, lng, emergency_contact) VALUES (?,?,?,?,?)',
    [userId, meetReportId || 0, lat ?? null, lng ?? null, emergencyContact || '']
  );
  return {
    meet_report_id: meetReportId || 0,
    sosPhone: cfg.sosPhone,
    emergency_contact: emergencyContact || '',
    guangdong110: guangdong110Payload(),
  };
}

async function locationStats(userId, meetReportId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS location_count, MAX(create_time) AS latest_location_time
     FROM meet_location_log
     WHERE user_id = ? AND meet_report_id = ?`,
    [userId, meetReportId]
  );
  const stat = rows[0] || {};
  return {
    location_count: Number(stat.location_count || 0),
    latest_location_time: stat.latest_location_time || null,
  };
}

/** GET /api/meet/share/:token — 亲友只读安全确认卡 */
router.get('/share/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return fail(res, '分享卡不存在', 404, 404);
    const [rows] = await pool.query(
      `SELECT id, user_id, meet_time, meet_place, lat, lng, meet_note,
              safety_prompt, status, card_no, share_token, create_time
       FROM meet_report
       WHERE share_token = ?
       LIMIT 1`,
      [token]
    );
    if (rows.length === 0) return fail(res, '分享卡不存在', 404, 404);
    const row = rows[0];
    const stat = await locationStats(row.user_id, row.id);
    return success(res, Object.assign({}, row, stat, { shared: true }));
  } catch (err) {
    next(err);
  }
});

router.use(userAuth, requireActiveUser);

/** POST /api/meet/create */
router.post('/create', async (req, res, next) => {
  try {
    const { match_user_id, meet_time, meet_place, lat, lng, meet_note, emergency_contact, safety_ack } = req.body;
    if (!safety_ack) return fail(res, '请先阅读并勾选安全提示');
    if (cfg.emergencyContactRequired && !/^\d{11}$/.test(String(emergency_contact || ''))) {
      return fail(res, '请填写有效的紧急联系人手机号');
    }
    const normalizedMeetTime = normalizeMeetTime(meet_time);
    if (normalizedMeetTime === false) return fail(res, '请填写有效的见面时间，如 2026-09-01 18:00');
    const loc = normalizeLocation(lat, lng);
    const cardNo = 'MC' + Date.now().toString(36).toUpperCase();
    const shareToken = randomUUID().replace(/-/g, '');
    const [r] = await pool.query(
      `INSERT INTO meet_report
       (user_id, match_user_id, meet_time, meet_place, lat, lng, meet_note, emergency_contact, safety_ack, safety_prompt, status, card_no, share_token)
       VALUES (?,?,?,?,?,?,?,?,1,?,0,?,?)`,
      [
        req.auth.id,
        Number(match_user_id) || 0,
        normalizedMeetTime,
        String(meet_place || '').slice(0, 200),
        loc.lat,
        loc.lng,
        String(meet_note || '').slice(0, cfg.meetNoteMaxLen),
        String(emergency_contact || ''),
        cfg.safetyTipsText,
        cardNo,
        shareToken,
      ]
    );
    return success(res, { id: r.insertId, card_no: cardNo, share_token: shareToken }, '见面报备已保存');
  } catch (err) {
    next(err);
  }
});

/** POST /api/meet/sos — 首页无报备紧急求助，也要先写证据链 */
router.post('/sos', async (req, res, next) => {
  try {
    const loc = normalizeLocation(req.body.lat, req.body.lng);
    const payload = await insertSosLog({
      userId: req.auth.id,
      meetReportId: 0,
      lat: loc.lat,
      lng: loc.lng,
      emergencyContact: '',
    });
    return success(res, payload, 'SOS 已记录');
  } catch (err) {
    next(err);
  }
});

/** GET /api/meet/list — 本人历史 */
router.get('/list', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT mr.id, mr.match_user_id, mr.meet_time, mr.meet_place, mr.status, mr.card_no, mr.share_token, mr.create_time,
              (SELECT COUNT(*) FROM meet_location_log ll WHERE ll.user_id = mr.user_id AND ll.meet_report_id = mr.id) AS location_count
       FROM meet_report mr
       WHERE mr.user_id = ?
       ORDER BY mr.id DESC LIMIT 50`,
      [req.auth.id]
    );
    return success(res, rows);
  } catch (err) {
    next(err);
  }
});

/** GET /api/meet/:id — 本人单条(含安全卡字段) */
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM meet_report WHERE id = ? AND user_id = ?',
      [Number(req.params.id), req.auth.id]
    );
    if (rows.length === 0) return fail(res, '记录不存在', 404, 404);
    const stat = await locationStats(req.auth.id, Number(req.params.id));
    return success(res, Object.assign({}, rows[0], stat));
  } catch (err) {
    next(err);
  }
});

/** POST /api/meet/:id/location — 用户主动开启前台安全守护时记录轨迹 */
router.post('/:id/location', async (req, res, next) => {
  try {
    const meetId = Number(req.params.id) || 0;
    const [m] = await pool.query('SELECT id FROM meet_report WHERE id = ? AND user_id = ?', [meetId, req.auth.id]);
    if (m.length === 0) return fail(res, '记录不存在', 404, 404);

    const loc = normalizeLocation(req.body.lat, req.body.lng, true);
    if (!loc) return fail(res, '定位参数无效');

    const accuracy = Number(req.body.accuracy);
    const [r] = await pool.query(
      `INSERT INTO meet_location_log (user_id, meet_report_id, lat, lng, accuracy, source)
       VALUES (?,?,?,?,?,?)`,
      [
        req.auth.id,
        meetId,
        loc.lat,
        loc.lng,
        Number.isFinite(accuracy) ? accuracy : null,
        String(req.body.source || 'watch').slice(0, 20),
      ]
    );
    const stat = await locationStats(req.auth.id, meetId);
    return success(res, Object.assign({ id: r.insertId }, stat));
  } catch (err) {
    next(err);
  }
});

/** POST /api/meet/:id/finish — 结束前台安全守护 */
router.post('/:id/finish', async (req, res, next) => {
  try {
    const [r] = await pool.query(
      'UPDATE meet_report SET status = 1 WHERE id = ? AND user_id = ?',
      [Number(req.params.id) || 0, req.auth.id]
    );
    if (r.affectedRows === 0) return fail(res, '记录不存在', 404, 404);
    return success(res, null, '已结束安全守护');
  } catch (err) {
    next(err);
  }
});

/** POST /api/meet/:id/cancel */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const [r] = await pool.query(
      'UPDATE meet_report SET status = 2 WHERE id = ? AND user_id = ?',
      [Number(req.params.id) || 0, req.auth.id]
    );
    if (r.affectedRows === 0) return fail(res, '记录不存在', 404, 404);
    return success(res, null, '已取消');
  } catch (err) {
    next(err);
  }
});

/** POST /api/meet/:id/sos — 一键呼救：记录证据，前端随后拉起广东110小程序 */
router.post('/:id/sos', async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const meetId = Number(req.params.id) || 0;
    const [m] = await pool.query('SELECT emergency_contact FROM meet_report WHERE id = ? AND user_id = ?', [meetId, req.auth.id]);
    if (m.length === 0) return fail(res, '记录不存在', 404, 404);
    const bodyLoc = normalizeLocation(lat, lng);
    const loc = (bodyLoc.lat === null || bodyLoc.lng === null) ? await latestLocation(req.auth.id, meetId) : bodyLoc;
    const contact = m[0].emergency_contact || '';
    const payload = await insertSosLog({
      userId: req.auth.id,
      meetReportId: meetId,
      lat: loc.lat,
      lng: loc.lng,
      emergencyContact: contact,
    });
    // ponytail: 无短信商/无客服值守 → 仅落证据 + 回传紧急联系人给前端引导用户自联；接入短信后在此发送
    return success(res, payload, 'SOS 已记录');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
