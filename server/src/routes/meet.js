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
    if (cfg.emergencyContactRequired && !/^\d{11}$/.test(String(emergency_contact || ''))) {
      return fail(res, '请填写有效的紧急联系人手机号');
    }
    const cardNo = 'MC' + Date.now().toString(36).toUpperCase();
    const [r] = await pool.query(
      `INSERT INTO meet_report
       (user_id, match_user_id, meet_time, meet_place, lat, lng, meet_note, emergency_contact, safety_ack, status, card_no)
       VALUES (?,?,?,?,?,?,?,?,1,0,?)`,
      [
        req.auth.id,
        Number(match_user_id) || 0,
        meet_time || null,
        String(meet_place || '').slice(0, 200),
        lat ?? null,
        lng ?? null,
        String(meet_note || '').slice(0, cfg.meetNoteMaxLen),
        String(emergency_contact || ''),
        cardNo,
      ]
    );
    return success(res, { id: r.insertId, card_no: cardNo }, '见面报备已保存');
  } catch (err) {
    next(err);
  }
});

/** GET /api/meet/list — 本人历史 */
router.get('/list', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, match_user_id, meet_time, meet_place, status, card_no, create_time FROM meet_report WHERE user_id = ? ORDER BY id DESC LIMIT 50',
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
    return success(res, rows[0]);
  } catch (err) {
    next(err);
  }
});

/** POST /api/meet/:id/cancel */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    await pool.query('UPDATE meet_report SET status = 2 WHERE id = ? AND user_id = ?', [Number(req.params.id), req.auth.id]);
    return success(res, null, '已取消');
  } catch (err) {
    next(err);
  }
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
  } catch (err) {
    next(err);
  }
});

module.exports = router;
