const express = require('express');
const pool = require('../config/db');
const { userAuth, adminAuth } = require('../middleware/auth');
const { requireActiveUser, debounceMiddleware } = require('../middleware/guard');
const { success, fail } = require('../utils/response');
const { USER_STATUS } = require('../config/constants');

const router = express.Router();

/** POST /api/report/marry — 直接结婚注销（兼容旧接口，改为待审核） */
router.post(
  '/marry',
  userAuth,
  requireActiveUser,
  debounceMiddleware((req) => `marry:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const { proof_img, remark } = req.body;
      const [pending] = await pool.query(
        'SELECT id FROM marry_report WHERE user_id = ? AND report_type = 1 AND audit_status = 0',
        [req.auth.id]
      );
      if (pending.length > 0) {
        return fail(res, '已有待审核的结婚报备');
      }

      await pool.query(
        `INSERT INTO marry_report (user_id, report_type, proof_img, audit_status)
         VALUES (?, 1, ?, 0)`,
        [req.auth.id, (remark || proof_img || '').slice(0, 255)]
      );
      return success(res, null, '结婚报备已提交，请等待平台审核');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/report/divorce-restore/:userId — admin audit divorced user restore
 */
router.post('/divorce-restore/:userId', adminAuth, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { report_id, approve, reject_reason } = req.body;

    const [users] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);
    if (users.length === 0) return fail(res, '用户不存在', 404, 404);

    if (approve) {
      await pool.query(
        `UPDATE \`user\` SET status = ?, marry_status = '未婚' WHERE id = ?`,
        [USER_STATUS.NORMAL, userId]
      );
      if (report_id) {
        await pool.query(
          'UPDATE marry_report SET audit_status = 1, reject_reason = \'\', update_time = NOW() WHERE id = ? AND user_id = ?',
          [report_id, userId]
        );
      }
      return success(res, null, '离异复入审核通过');
    }

    if (report_id) {
      await pool.query(
        'UPDATE marry_report SET audit_status = 2, reject_reason = ?, update_time = NOW() WHERE id = ? AND user_id = ?',
        [String(reject_reason || '').slice(0, 255), report_id, userId]
      );
    }
    return success(res, null, reject_reason || '已驳回复入申请');
  } catch (err) {
    next(err);
  }
});

/** POST /api/report/divorce/:userId — legacy admin mark divorced */
router.post('/divorce/:userId', adminAuth, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { restore, proof_img } = req.body;

    const [users] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);
    if (users.length === 0) return fail(res, '用户不存在', 404, 404);

    if (restore) {
      await pool.query(
        `UPDATE \`user\` SET status = ?, marry_status = '未婚' WHERE id = ?`,
        [USER_STATUS.NORMAL, userId]
      );
      return success(res, null, '用户已恢复为正常状态');
    }

    await pool.query(
      `UPDATE \`user\` SET status = ?, marry_status = '离异' WHERE id = ?`,
      [USER_STATUS.BANNED, userId]
    );
    await pool.query(
      `INSERT INTO marry_report (user_id, report_type, proof_img, audit_status)
       VALUES (?, 2, ?, 0)`,
      [userId, proof_img || '']
    );
    return success(res, null, '已标记为离异，用户需管理员恢复');
  } catch (err) {
    next(err);
  }
});

/** GET /api/report/list — admin */
router.get('/list', adminAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const offset = (page - 1) * pageSize;

    const [count] = await pool.query('SELECT COUNT(*) AS total FROM marry_report');
    const [rows] = await pool.query(
      `SELECT mr.*, COALESCE(NULLIF(mr.openid, ''), u.openid) AS openid,
              u.gender, u.city
       FROM marry_report mr
       LEFT JOIN \`user\` u ON u.id = mr.user_id
       ORDER BY mr.id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    return success(res, {
      list: rows,
      total: count[0].total,
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
