const express = require('express');
const pool = require('../config/db');
const { adminAuth } = require('../middleware/auth');
const { success, fail, paginate } = require('../utils/response');
const { hashPassword } = require('../utils/crypto');
const {
  USER_STATUS,
  PARTNER_STATUS,
  VIP_PRICE,
  MARRY_REPORT_TYPE,
} = require('../config/constants');
const {
  formatUserForAdmin,
  formatPartnerForAdmin,
  formatOrderForAdmin,
  formatWithdrawForAdmin,
  formatChatSession,
  privacyAuthToAgreements,
} = require('../utils/apiFormat');

const router = express.Router();

router.use(adminAuth);

/** GET /api/admin/dashboard */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT COUNT(*) AS c FROM `user`');
    const [[vip]] = await pool.query(
      'SELECT COUNT(*) AS c FROM `user` WHERE is_vip = 1 AND vip_expire_time > NOW()'
    );
    const [[p]] = await pool.query('SELECT COUNT(*) AS c FROM `partner`');
    const [[o]] = await pool.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(price), 0) AS revenue
       FROM user_order WHERE pay_status = 1`
    );
    const [[pendingP]] = await pool.query(
      'SELECT COUNT(*) AS c FROM `partner` WHERE status = 0'
    );
    const [[pendingW]] = await pool.query(
      'SELECT COUNT(*) AS c FROM partner_withdraw WHERE status = 0'
    );
    const [[stat]] = await pool.query(
      'SELECT marry_success_count FROM system_stat ORDER BY id ASC LIMIT 1'
    );

    return success(res, {
      users: u.c,
      vip_users: vip.c,
      partners: p.c,
      paid_orders: o.c,
      revenue: Number(o.revenue),
      pending_partner_approve: pendingP.c,
      pending_withdrawals: pendingW.c,
      marry_success_count: stat?.marry_success_count || 0,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/users */
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const offset = (page - 1) * pageSize;
    const { status, keyword } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    if (status !== undefined && status !== '') {
      where += ' AND u.status = ?';
      params.push(Number(status));
    }
    if (keyword) {
      where += ' AND (u.openid LIKE ? OR u.city LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw);
    }

    const [count] = await pool.query(`SELECT COUNT(*) AS total FROM \`user\` u ${where}`, params);
    const [rows] = await pool.query(
      `SELECT u.id, u.openid, u.gender, u.birth_year, u.status, u.marry_status,
              u.is_vip, u.vip_expire_time, u.promote_partner_id, u.promote_code,
              u.city, u.create_time, p.name AS partner_name
       FROM \`user\` u
       LEFT JOIN \`partner\` p ON p.id = u.promote_partner_id
       ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return success(res, paginate(rows.map(formatUserForAdmin), count[0].total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/users/:id */
router.get('/users/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM `user` WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return fail(res, '用户不存在', 404, 404);
    const [settings] = await pool.query(
      'SELECT * FROM user_match_setting WHERE user_id = ?',
      [req.params.id]
    );
    const [authLogs] = await pool.query(
      'SELECT * FROM user_privacy_auth_log WHERE user_id = ? ORDER BY id DESC LIMIT 10',
      [req.params.id]
    );
    const latestAuth = authLogs[0] || null;
    return success(res, {
      user: formatUserForAdmin(rows[0]),
      match_settings: settings[0] || null,
      privacy_auth_logs: authLogs,
      agreements: privacyAuthToAgreements(latestAuth),
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/users/:id */
router.put('/users/:id', async (req, res, next) => {
  try {
    const { status, vip_expire_time, is_vip, marry_status, vip_expire_at } = req.body;
    const expireTime = vip_expire_time || vip_expire_at || null;
    const allowed = [USER_STATUS.PENDING, USER_STATUS.NORMAL, USER_STATUS.BANNED, USER_STATUS.MARRIED];
    if (status !== undefined && !allowed.includes(Number(status))) {
      return fail(res, '无效状态');
    }

    await pool.query(
      `UPDATE \`user\` SET
        status = COALESCE(?, status),
        is_vip = COALESCE(?, is_vip),
        vip_expire_time = COALESCE(?, vip_expire_time),
        marry_status = COALESCE(?, marry_status)
       WHERE id = ?`,
      [status, is_vip, expireTime, marry_status, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM `user` WHERE id = ?', [req.params.id]);
    return success(res, formatUserForAdmin(rows[0]), '更新成功');
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/openid-blacklist */
router.post('/openid-blacklist', async (req, res, next) => {
  try {
    const { openid, reason } = req.body;
    if (!openid) return fail(res, '缺少 openid');
    await pool.query(
      `INSERT INTO openid_blacklist (openid, reason) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [openid, reason || '']
    );
    return success(res, null, '已加入黑名单');
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/openid-blacklist/:openid */
router.delete('/openid-blacklist/:openid', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM openid_blacklist WHERE openid = ?', [req.params.openid]);
    return success(res, null, '已移除');
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/partners */
router.get('/partners', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const offset = (page - 1) * pageSize;
    const { status } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    if (status !== undefined && status !== '') {
      where += ' AND p.status = ?';
      params.push(Number(status));
    }

    const [count] = await pool.query(`SELECT COUNT(*) AS total FROM \`partner\` p ${where}`, params);
    const [rows] = await pool.query(
      `SELECT p.id, p.circle_id, p.name, p.phone, p.promote_code, p.status,
              p.balance, p.total_commission, p.total_promote_user, p.total_promote_vip,
              p.create_time, oc.circle_name
       FROM \`partner\` p
       LEFT JOIN occupation_circle oc ON oc.id = p.circle_id
       ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return success(res, paginate(rows.map(formatPartnerForAdmin), count[0].total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/partners/:id/approve */
router.post('/partners/:id/approve', async (req, res, next) => {
  try {
    const { action } = req.body;
    const newStatus = action === 'reject' ? PARTNER_STATUS.DISABLED : PARTNER_STATUS.ACTIVE;
    await pool.query('UPDATE `partner` SET status = ? WHERE id = ?', [newStatus, req.params.id]);
    if (newStatus === PARTNER_STATUS.ACTIVE) {
      const [p] = await pool.query('SELECT circle_id FROM `partner` WHERE id = ?', [req.params.id]);
      if (p.length > 0) {
        await pool.query(
          'UPDATE occupation_circle SET partner_id = ? WHERE id = ?',
          [req.params.id, p[0].circle_id]
        );
      }
    }
    return success(res, null, action === 'reject' ? '已拒绝' : '已激活');
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/partners/:id */
router.put('/partners/:id', async (req, res, next) => {
  try {
    const { status, name, phone } = req.body;
    await pool.query(
      'UPDATE `partner` SET status = COALESCE(?, status), name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?',
      [status, name, phone, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM `partner` WHERE id = ?', [req.params.id]);
    return success(res, formatPartnerForAdmin(rows[0]));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/withdrawals */
router.get('/withdrawals', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.*, p.name AS partner_name, p.phone AS partner_phone
       FROM partner_withdraw w
       JOIN \`partner\` p ON p.id = w.partner_id
       ORDER BY w.id DESC LIMIT 100`
    );
    return success(res, rows.map(formatWithdrawForAdmin));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/withdrawals/:id */
router.put('/withdrawals/:id', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { status } = req.body;
    await conn.beginTransaction();

    const [w] = await conn.query(
      'SELECT * FROM partner_withdraw WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (w.length === 0) {
      await conn.rollback();
      return fail(res, '记录不存在', 404, 404);
    }
    const withdraw = w[0];

    if (Number(status) === 1 && withdraw.status === 0) {
      await conn.query(
        'UPDATE partner_withdraw SET status = 1 WHERE id = ?',
        [req.params.id]
      );
    } else if (Number(status) === 2 && withdraw.status === 0) {
      await conn.query(
        'UPDATE `partner` SET balance = balance + ? WHERE id = ?',
        [withdraw.amount, withdraw.partner_id]
      );
      await conn.query(
        'UPDATE partner_withdraw SET status = 2 WHERE id = ?',
        [req.params.id]
      );
    }

    await conn.commit();
    return success(res, null, '已处理');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

/** GET /api/admin/orders */
router.get('/orders', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const offset = (page - 1) * pageSize;

    const [count] = await pool.query('SELECT COUNT(*) AS total FROM user_order');
    const [rows] = await pool.query(
      `SELECT o.*, u.openid, p.name AS partner_name
       FROM user_order o
       LEFT JOIN \`user\` u ON u.id = o.user_id
       LEFT JOIN \`partner\` p ON p.id = o.partner_id
       ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    return success(res, paginate(rows.map(formatOrderForAdmin), count[0].total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/circles — occupation_circle CRUD */
router.get('/circles', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM occupation_circle ORDER BY id ASC'
    );
    return success(res, rows);
  } catch (err) {
    next(err);
  }
});

router.post('/circles', async (req, res, next) => {
  try {
    const { circle_name, plate_name, status } = req.body;
    if (!circle_name || !plate_name) return fail(res, '名称不能为空');
    const [r] = await pool.query(
      'INSERT INTO occupation_circle (circle_name, plate_name, status) VALUES (?, ?, ?)',
      [circle_name, plate_name, status ?? 1]
    );
    return success(res, { id: r.insertId }, '创建成功');
  } catch (err) {
    next(err);
  }
});

router.put('/circles/:id', async (req, res, next) => {
  try {
    const { circle_name, plate_name, status } = req.body;
    await pool.query(
      `UPDATE occupation_circle SET
        circle_name = COALESCE(?, circle_name),
        plate_name = COALESCE(?, plate_name),
        status = COALESCE(?, status)
       WHERE id = ?`,
      [circle_name, plate_name, status, req.params.id]
    );
    return success(res, null, '更新成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/circles/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM occupation_circle WHERE id = ?', [req.params.id]);
    return success(res, null, '已删除');
  } catch (err) {
    next(err);
  }
});

/** AI Knowledge Base */
router.get('/knowledge', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ai_knowledge ORDER BY id DESC');
    return success(res, rows);
  } catch (err) {
    next(err);
  }
});

router.post('/knowledge', async (req, res, next) => {
  try {
    const { question, answer, status } = req.body;
    if (!question || !answer) return fail(res, '问题和答案不能为空');
    const [r] = await pool.query(
      'INSERT INTO ai_knowledge (question, answer, status) VALUES (?, ?, ?)',
      [question, answer, status ?? 1]
    );
    return success(res, { id: r.insertId }, '创建成功');
  } catch (err) {
    next(err);
  }
});

router.put('/knowledge/:id', async (req, res, next) => {
  try {
    const { question, answer, status } = req.body;
    await pool.query(
      `UPDATE ai_knowledge SET
        question = COALESCE(?, question),
        answer = COALESCE(?, answer),
        status = COALESCE(?, status)
       WHERE id = ?`,
      [question, answer, status, req.params.id]
    );
    return success(res, null, '更新成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/knowledge/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM ai_knowledge WHERE id = ?', [req.params.id]);
    return success(res, null, '已删除');
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/chat/sessions — manual transfer queue */
router.get('/chat/sessions', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT acl.user_id, MAX(acl.id) AS last_log_id, MAX(acl.create_time) AS last_time,
              u.openid, u.gender, u.city
       FROM ai_chat_log acl
       JOIN \`user\` u ON u.id = acl.user_id
       WHERE acl.is_manual_transfer = 1
       GROUP BY acl.user_id, u.openid, u.gender, u.city
       ORDER BY last_time DESC LIMIT 50`
    );
    return success(res, rows.map(formatChatSession));
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/chat/reply */
router.post('/chat/reply', async (req, res, next) => {
  try {
    const { user_id, session_id, content } = req.body;
    const targetUserId = user_id || session_id;
    if (!targetUserId || !content) return fail(res, '参数不完整');

    await pool.query(
      `INSERT INTO ai_chat_log (user_id, user_content, ai_content, is_manual_transfer)
       VALUES (?, ?, ?, 0)`,
      [targetUserId, '[管理员回复]', content]
    );
    return success(res, null, '回复成功');
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/stats */
router.put('/stats', async (req, res, next) => {
  try {
    const marry_success_count =
      req.body.marry_success_count ??
      req.body.stats?.marry_success_count;
    if (marry_success_count === undefined) return fail(res, '无效数据');

    await pool.query(
      'UPDATE system_stat SET marry_success_count = ? WHERE id = 1',
      [Number(marry_success_count)]
    );
    return success(res, null, '更新成功');
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/privacy-logs */
router.get('/privacy-logs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const offset = (page - 1) * pageSize;

    const [count] = await pool.query('SELECT COUNT(*) AS total FROM user_privacy_auth_log');
    const [rows] = await pool.query(
      `SELECT l.*, u.openid, u.gender, u.birth_year, u.city, u.create_time AS user_create_time
       FROM user_privacy_auth_log l
       JOIN \`user\` u ON u.id = l.user_id
       ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    const list = rows.map((row) => ({
      user_id: row.user_id,
      user: formatUserForAdmin({
        id: row.user_id,
        openid: row.openid,
        gender: row.gender,
        birth_year: row.birth_year,
        city: row.city,
        create_time: row.user_create_time,
      }),
      agreements: privacyAuthToAgreements(row),
      auth_time: row.auth_time,
    }));
    return success(res, paginate(list, count[0].total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/matches */
router.get('/matches', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const offset = (page - 1) * pageSize;

    const [count] = await pool.query('SELECT COUNT(*) AS total FROM user_match_log');
    const [rows] = await pool.query(
      `SELECT ml.*, u.openid AS user_openid, mu.openid AS matched_openid
       FROM user_match_log ml
       JOIN \`user\` u ON u.id = ml.user_id
       JOIN \`user\` mu ON mu.id = ml.match_user_id
       ORDER BY ml.id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    return success(res, paginate(rows, count[0].total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/marry-reports/:id/approve — 结婚报备/注销审核 */
router.post('/marry-reports/:id/approve', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const reportId = Number(req.params.id);
    const { approve, reject_reason } = req.body;

    await conn.beginTransaction();
    const [reports] = await conn.query(
      'SELECT * FROM marry_report WHERE id = ? FOR UPDATE',
      [reportId]
    );
    if (reports.length === 0) {
      await conn.rollback();
      return fail(res, '报备记录不存在', 404, 404);
    }
    const report = reports[0];

    if (approve) {
      await conn.query(
        'UPDATE marry_report SET audit_status = 1, reject_reason = \'\', update_time = NOW() WHERE id = ?',
        [reportId]
      );

      if (Number(report.report_type) === MARRY_REPORT_TYPE.CANCEL) {
        await conn.query(
          'UPDATE `user` SET status = ?, is_vip = 0, vip_expire_time = NULL WHERE id = ?',
          [USER_STATUS.BANNED, report.user_id]
        );
        await conn.query('DELETE FROM user_match_setting WHERE user_id = ?', [report.user_id]);
        await conn.query(
          'DELETE FROM user_match_log WHERE user_id = ? OR match_user_id = ?',
          [report.user_id, report.user_id]
        );
        await conn.commit();
        return success(res, null, '审核通过，账号已注销');
      }

      if (Number(report.report_type) === MARRY_REPORT_TYPE.MARRY) {
        await conn.query(
          'UPDATE `user` SET status = ?, is_vip = 0, vip_expire_time = NULL WHERE id = ?',
          [USER_STATUS.MARRIED, report.user_id]
        );
        await conn.query(
          'UPDATE system_stat SET marry_success_count = marry_success_count + 1 WHERE id = 1'
        );
        await conn.commit();
        return success(res, null, '结婚审核通过，账号已注销');
      }

      await conn.commit();
      return success(res, null, '审核通过');
    }

    await conn.query(
      'UPDATE marry_report SET audit_status = 2, reject_reason = ?, update_time = NOW() WHERE id = ?',
      [String(reject_reason || '').slice(0, 255), reportId]
    );
    await conn.commit();
    return success(res, null, reject_reason || '已驳回');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

/** GET /api/admin/marry-reports */
router.get('/marry-reports', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT mr.*, COALESCE(NULLIF(mr.openid, ''), u.openid) AS openid,
              u.gender, u.city
       FROM marry_report mr
       LEFT JOIN \`user\` u ON u.id = mr.user_id
       ORDER BY mr.id DESC LIMIT 100`
    );
    return success(res, rows);
  } catch (err) {
    next(err);
  }
});

/** Exports */
router.get('/export/users', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, openid, gender, birth_year, status, marry_status, is_vip,
              vip_expire_time, promote_partner_id, create_time
       FROM \`user\` ORDER BY id DESC LIMIT 5000`
    );
    const header = 'id,openid,gender,birth_year,status,marry_status,is_vip,vip_expire_time,promote_partner_id,create_time\n';
    const csv = rows.map((r) =>
      Object.values(r).map((v) => `"${v ?? ''}"`).join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    return res.send('\uFEFF' + header + csv);
  } catch (err) {
    next(err);
  }
});

router.get('/export/orders', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT order_no, user_id, price, pay_status, partner_id, partner_commission,
              platform_income, settle_status, pay_time, create_time
       FROM user_order ORDER BY id DESC LIMIT 5000`
    );
    const header = 'order_no,user_id,price,pay_status,partner_id,partner_commission,platform_income,settle_status,pay_time,create_time\n';
    const csv = rows.map((r) =>
      Object.values(r).map((v) => `"${v ?? ''}"`).join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
    return res.send('\uFEFF' + header + csv);
  } catch (err) {
    next(err);
  }
});

router.get('/export/partners', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, circle_id, name, phone, promote_code, status, balance,
              total_commission, total_promote_user, total_promote_vip, create_time
       FROM \`partner\``
    );
    const header = 'id,circle_id,name,phone,promote_code,status,balance,total_commission,total_promote_user,total_promote_vip,create_time\n';
    const csv = rows.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=partners.csv');
    return res.send('\uFEFF' + header + csv);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/admins */
router.post('/admins', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return fail(res, '账号密码不能为空');

    const [exists] = await pool.query('SELECT id FROM `admin` WHERE username = ?', [username]);
    if (exists.length > 0) return fail(res, '用户名已存在');

    const [r] = await pool.query(
      'INSERT INTO `admin` (username, password) VALUES (?, ?)',
      [username, hashPassword(password)]
    );
    return success(res, { id: r.insertId }, '管理员创建成功');
  } catch (err) {
    next(err);
  }
});

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
  } catch (err) {
    next(err);
  }
});

module.exports = router;
