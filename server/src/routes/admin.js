const express = require('express');
const pool = require('../config/db');
const { adminAuth } = require('../middleware/auth');
const { success, fail, paginate } = require('../utils/response');
const { hashPassword } = require('../utils/crypto');
const { nextMemberStatus } = require('../utils/memberPolicy');
const {
  USER_STATUS,
  PARTNER_STATUS,
  VIP_PRICE,
  MARRY_REPORT_TYPE,
  ADMIN_ROLES,
} = require('../config/constants');
const {
  formatUserForAdmin,
  formatPartnerForAdmin,
  privacyAuthToAgreements,
} = require('../utils/apiFormat');
const {
  currentAdminRole,
  hasRouteAccess,
  canSeeOpenId,
} = require('../utils/adminRbac');
const { buildAiOps } = require('../utils/aiOpsHealth');
const {
  formatOrderByRole,
  formatOrderForService,
  formatHandoffTicket,
  formatMatchByRole,
  formatWithdrawByRole,
  formatUserDetailForAuditor,
  formatChatSessionForService,
} = require('../utils/roleDataProjection');

const router = express.Router();

router.use(adminAuth);
router.use(requireAdminAccess);

function requireAdminAccess(req, res, next) {
  req.adminRole = currentAdminRole(req);
  if (hasRouteAccess(req)) return next();
  return fail(res, '当前账号无权访问该后台模块', 403, 403);
}

function maskPhone(phone) {
  const value = String(phone || '').trim();
  const matched = value.match(/^(\d{3})\d{4}(\d{4})$/);
  if (matched) return `${matched[1]}****${matched[2]}`;
  if (!value) return '';
  return `${value.slice(0, 3)}****`;
}

/** GET /api/admin/dashboard */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT COUNT(*) AS c FROM `user`');
    const [[vip]] = await pool.query(
      `SELECT COUNT(*) AS c FROM \`user\`
       WHERE free_member = 1 OR (is_vip = 1 AND vip_expire_time > NOW())`
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

    let pendingMembers = 0
    let openTickets = 0
    let stuckCoordinations = 0
    let aiFailed = null
    let aiDataAvailable = false
    let aiQueryFailed = false
    let latestProvider = null
    let latestModel = null
    let lastRunAt = null
    let hasAnyRun = false
    try {
      const [[pm]] = await pool.query(
        `SELECT COUNT(*) AS c FROM member_application WHERE status = 'pending_review'`
      )
      pendingMembers = pm.c
    } catch (e) { /* table may differ */ }
    try {
      const [[t]] = await pool.query(
        `SELECT COUNT(*) AS c FROM agent_human_ticket WHERE status IN ('open','pending','active')`
      )
      openTickets = t.c
    } catch (e) { /* optional */ }
    try {
      const [[c]] = await pool.query(
        `SELECT COUNT(*) AS c FROM date_coordination
         WHERE status IN ('failed','manual_handoff')
            OR (status IN ('computing_overlap','pending_confirmation','pending_primary_selection')
                AND update_time < DATE_SUB(NOW(), INTERVAL 1 DAY))`
      )
      stuckCoordinations = c.c
    } catch (e) { /* optional */ }
    try {
      const [[a]] = await pool.query(
        `SELECT COUNT(*) AS c FROM agent_run WHERE status IN ('failed','error')
         AND create_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)`
      )
      aiFailed = a.c
      aiDataAvailable = true
      const [latest] = await pool.query(
        `SELECT provider, model, create_time FROM agent_run ORDER BY id DESC LIMIT 1`
      )
      if (latest && latest[0]) {
        hasAnyRun = true
        latestProvider = latest[0].provider || null
        latestModel = latest[0].model || null
        lastRunAt = latest[0].create_time || null
      }
    } catch (e) {
      aiQueryFailed = true
      aiDataAvailable = false
      aiFailed = null
    }

    const aiOps = buildAiOps({
      query_failed: aiQueryFailed,
      data_available: aiDataAvailable,
      failed_today: aiFailed,
      provider: latestProvider,
      model: latestModel,
      last_run_at: lastRunAt,
      has_any_run: hasAnyRun
    })

    const todos = [
      { key: 'members', title: '待审核会员', count: pendingMembers, priority: pendingMembers ? 'P1' : 'P2', cta: '立即审核', page: 'members' },
      { key: 'service', title: '待处理客服', count: openTickets, priority: openTickets ? 'P1' : 'P2', cta: '去处理', page: 'service' },
      { key: 'coordination', title: '待处理约会协调', count: stuckCoordinations, priority: stuckCoordinations ? 'P1' : 'P2', cta: '查看协调', page: 'service' },
      { key: 'ai', title: '异常 AI 会话', count: Number(aiOps.failed_today || 0), priority: aiOps.status === 'degraded' ? 'P1' : 'P2', cta: '查看异常', page: 'service' },
      { key: 'withdrawals', title: '待处理提现', count: pendingW.c, priority: pendingW.c ? 'P0' : 'P2', cta: '去审核', page: 'withdrawals' },
      { key: 'partners', title: '待审合伙人', count: pendingP.c, priority: pendingP.c ? 'P2' : 'P2', cta: '去审核', page: 'partners' }
    ]
    const todoTotal = todos.reduce((s, t) => s + Number(t.count || 0), 0)

    return success(res, {
      users: u.c,
      vip_users: vip.c,
      partners: p.c,
      paid_orders: o.c,
      revenue: Number(o.revenue),
      pending_partner_approve: pendingP.c,
      pending_withdrawals: pendingW.c,
      pending_member_applications: pendingMembers,
      open_service_tickets: openTickets,
      stuck_coordinations: stuckCoordinations,
      ai_failed_today: aiOps.failed_today,
      marry_success_count: stat?.marry_success_count || 0,
      todos,
      todo_total: todoTotal,
      ai_ops: aiOps,
      priority_queue: todos.filter((t) => Number(t.count) > 0).sort((a, b) => {
        const rank = { P0: 0, P1: 1, P2: 2 }
        return (rank[a.priority] || 9) - (rank[b.priority] || 9)
      })
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
    return success(res, paginate(
      rows.map((row) => formatUserForAdmin(row, { includeOpenId: canSeeOpenId(req.adminRole) })),
      count[0].total,
      page,
      pageSize
    ));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/users/:id */
router.get('/users/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM `user` WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return fail(res, '用户不存在', 404, 404);
    const [authLogs] = await pool.query(
      'SELECT * FROM user_privacy_auth_log WHERE user_id = ? ORDER BY id DESC LIMIT 10',
      [req.params.id]
    );
    const latestAuth = authLogs[0] || null;

    if (req.adminRole === ADMIN_ROLES.AUDITOR) {
      let partnerName = null;
      if (rows[0].promote_partner_id) {
        const [partners] = await pool.query(
          'SELECT name FROM partner WHERE id = ? LIMIT 1',
          [rows[0].promote_partner_id]
        );
        partnerName = partners[0]?.name || null;
      }
      return success(res, formatUserDetailForAuditor(rows[0], {
        latestAuth,
        partner_name: partnerName,
        agreements_status: {
          user_service: Boolean(latestAuth?.auth_service),
          privacy: Boolean(latestAuth?.auth_privacy),
          data_auth: Boolean(latestAuth?.auth_data),
        },
      }));
    }

    const [settings] = await pool.query(
      'SELECT * FROM user_match_setting WHERE user_id = ?',
      [req.params.id]
    );
    return success(res, {
      user: formatUserForAdmin(rows[0], { includeOpenId: canSeeOpenId(req.adminRole) }),
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
    return success(res, rows.map((row) => formatWithdrawByRole(row, req.adminRole)));
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
    const includeOpenId = canSeeOpenId(req.adminRole);
    const [rows] = await pool.query(
      includeOpenId
        ? `SELECT o.*, u.openid, u.support_code, p.name AS partner_name
           FROM user_order o
           LEFT JOIN \`user\` u ON u.id = o.user_id
           LEFT JOIN \`partner\` p ON p.id = o.partner_id
           ORDER BY o.id DESC LIMIT ? OFFSET ?`
        : `SELECT o.*, u.support_code, p.name AS partner_name
           FROM user_order o
           LEFT JOIN \`user\` u ON u.id = o.user_id
           LEFT JOIN \`partner\` p ON p.id = o.partner_id
           ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    return success(res, paginate(
      rows.map((row) => formatOrderByRole(row, req.adminRole)),
      count[0].total,
      page,
      pageSize
    ));
  } catch (err) {
    next(err);
  }
});

router.get('/member-applications', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const params = [];
    let where = 'WHERE 1=1';
    if (status) {
      where += ' AND ma.status = ?';
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT ma.*, u.city, u.gender, u.birth_year, u.education, u.occupation_description,
              u.promote_partner_id, p.name AS partner_name
       FROM member_application ma
       JOIN \`user\` u ON u.id = ma.user_id
       LEFT JOIN partner p ON p.id = ma.assigned_partner_id
       ${where}
       ORDER BY ma.id DESC LIMIT 200`,
      params
    );
    return success(res, { list: rows });
  } catch (err) {
    next(err);
  }
});

router.put('/member-applications/:id/review', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const applicationId = Number(req.params.id);
    const action = String(req.body.action || '');
    const note = String(req.body.reason || req.body.note || '').trim().slice(0, 500);
    const [rows] = await conn.query('SELECT * FROM member_application WHERE id = ?', [applicationId]);
    if (!rows.length) return fail(res, '会员申请不存在', 404, 404);
    const application = rows[0];
    if (['need_more_info', 'reject', 'disable'].includes(action) && !note) return fail(res, '请填写审核意见');
    let nextStatus;
    try {
      nextStatus = nextMemberStatus(application.status, action);
    } catch (err) {
      return fail(res, err.message);
    }
    await conn.beginTransaction();
    await conn.query(
      `UPDATE member_application SET status = ?, review_note = ?, reviewed_by_role = 'admin',
       reviewed_by_id = ?, reviewed_at = NOW() WHERE id = ?`,
      [nextStatus, note, req.auth.id, applicationId]
    );
    await conn.query(
      'UPDATE `user` SET member_status = ?, member_status_updated_at = NOW() WHERE id = ?',
      [nextStatus, application.user_id]
    );
    await conn.query(
      `INSERT INTO partner_user_audit_log
       (partner_id, user_id, application_id, actor_role, actor_id, action, from_status, to_status, reason)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, ?)`,
      [application.assigned_partner_id, application.user_id, applicationId, req.auth.id, action, application.status, nextStatus, note]
    );
    await conn.commit();
    return success(res, { member_status: nextStatus }, '审核状态已更新');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.put('/member-applications/:id/reassign', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const applicationId = Number(req.params.id);
    const partnerId = Number(req.body.partner_id || 0);
    const changeOwnership = req.body.change_ownership === true;
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!partnerId || !reason) return fail(res, '请选择接管合伙人并填写原因');
    const [partners] = await conn.query('SELECT id FROM partner WHERE id = ? AND status = 1', [partnerId]);
    if (!partners.length) return fail(res, '目标合伙人不存在或已停用');
    const [apps] = await conn.query('SELECT * FROM member_application WHERE id = ?', [applicationId]);
    if (!apps.length) return fail(res, '会员申请不存在', 404, 404);
    const application = apps[0];
    await conn.beginTransaction();
    if (changeOwnership) {
      const [[paid]] = await conn.query(
        'SELECT COUNT(*) AS c FROM user_order WHERE user_id = ? AND pay_status = 1',
        [application.user_id]
      );
      if (paid.c > 0 || application.status === 'approved') {
        await conn.rollback();
        return fail(res, '已批准或已有支付订单，只能转交审核，不能修改原始归属');
      }
      await conn.query(
        'UPDATE `user` SET promote_partner_id = ? WHERE id = ?',
        [partnerId, application.user_id]
      );
      await conn.query(
        'UPDATE member_application SET inviter_partner_id = ?, assigned_partner_id = ? WHERE id = ?',
        [partnerId, partnerId, applicationId]
      );
    } else {
      await conn.query('UPDATE member_application SET assigned_partner_id = ? WHERE id = ?', [partnerId, applicationId]);
    }
    await conn.query(
      `INSERT INTO partner_user_audit_log
       (partner_id, user_id, application_id, actor_role, actor_id, action, from_status, to_status, reason)
       VALUES (?, ?, ?, 'admin', ?, 'reassign', ?, ?, ?)`,
      [partnerId, application.user_id, applicationId, req.auth.id, application.status, application.status, reason]
    );
    await conn.commit();
    return success(res, { assigned_partner_id: partnerId }, '审核归属已更新');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
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
              u.gender, u.city, u.support_code, u.phone
       FROM ai_chat_log acl
       JOIN \`user\` u ON u.id = acl.user_id
       WHERE acl.is_manual_transfer = 1
       GROUP BY acl.user_id, u.gender, u.city, u.support_code, u.phone
       ORDER BY last_time DESC LIMIT 50`
    );
    return success(res, rows.map(formatChatSessionForService));
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

/** GET /api/admin/handoff/tickets — official match handoff tickets */
router.get('/handoff/tickets', async (req, res, next) => {
  try {
    const includeOpenId = canSeeOpenId(req.adminRole);
    const [rows] = await pool.query(
      includeOpenId
        ? `SELECT t.*, u.openid AS user_openid, u.city AS user_city, u.support_code AS user_support_code,
                  mu.openid AS match_user_openid, mu.city AS match_user_city, mu.support_code AS match_user_support_code
           FROM match_handoff_ticket t
           JOIN \`user\` u ON u.id = t.user_id
           JOIN \`user\` mu ON mu.id = t.match_user_id
           ORDER BY t.update_time DESC, t.id DESC
           LIMIT 100`
        : `SELECT t.*, u.city AS user_city, u.support_code AS user_support_code,
                  mu.city AS match_user_city, mu.support_code AS match_user_support_code
           FROM match_handoff_ticket t
           JOIN \`user\` u ON u.id = t.user_id
           JOIN \`user\` mu ON mu.id = t.match_user_id
           ORDER BY t.update_time DESC, t.id DESC
           LIMIT 100`
    );
    return success(res, rows.map((row) => formatHandoffTicket(row, req.adminRole)));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/handoff/tickets/:id */
router.put('/handoff/tickets/:id', async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').trim();
    const serviceNote = String(req.body?.service_note || req.body?.serviceNote || '').trim().slice(0, 500);
    const allowed = new Set(['submitted', 'processing', 'waiting_partner', 'arranged', 'closed']);
    if (!allowed.has(status)) return fail(res, '无效状态');

    await pool.query(
      'UPDATE match_handoff_ticket SET status = ?, service_note = ? WHERE id = ?',
      [status, serviceNote, req.params.id]
    );
    const [rows] = await pool.query(
      `SELECT t.*, u.city AS user_city, u.support_code AS user_support_code,
              mu.city AS match_user_city, mu.support_code AS match_user_support_code
       FROM match_handoff_ticket t
       JOIN \`user\` u ON u.id = t.user_id
       JOIN \`user\` mu ON mu.id = t.match_user_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return fail(res, '工单不存在', 404, 404);
    return success(res, formatHandoffTicket(rows[0], req.adminRole), '已更新');
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/service/workbench — customer-service focused queue */
router.get('/service/workbench', async (req, res, next) => {
  try {
    const [chatRows] = await pool.query(
      `SELECT acl.user_id, MAX(acl.id) AS last_log_id, MAX(acl.create_time) AS last_time,
              u.gender, u.city, u.support_code, u.phone
       FROM ai_chat_log acl
       JOIN \`user\` u ON u.id = acl.user_id
       WHERE acl.is_manual_transfer = 1
       GROUP BY acl.user_id, u.gender, u.city, u.support_code, u.phone
       ORDER BY last_time DESC LIMIT 20`
    );
    const [ticketRows] = await pool.query(
      `SELECT t.*, u.city AS user_city, u.support_code AS user_support_code,
              mu.city AS match_user_city, mu.support_code AS match_user_support_code
       FROM match_handoff_ticket t
       JOIN \`user\` u ON u.id = t.user_id
       JOIN \`user\` mu ON mu.id = t.match_user_id
       ORDER BY t.update_time DESC, t.id DESC
       LIMIT 20`
    );
    const [orderRows] = await pool.query(
      `SELECT o.*, u.support_code
       FROM user_order o
       LEFT JOIN \`user\` u ON u.id = o.user_id
       ORDER BY o.id DESC LIMIT 20`
    );
    return success(res, {
      chat_sessions: chatRows.map(formatChatSessionForService),
      handoff_tickets: ticketRows.map((row) => formatHandoffTicket(row, req.adminRole)),
      orders: orderRows.map(formatOrderForService),
    });
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
    const includeOpenId = canSeeOpenId(req.adminRole);

    const [count] = await pool.query('SELECT COUNT(*) AS total FROM user_match_log');
    const [rows] = await pool.query(
      includeOpenId
        ? `SELECT ml.*, u.openid AS user_openid, u.support_code AS user_support_code,
                  mu.openid AS matched_openid, mu.support_code AS matched_support_code
           FROM user_match_log ml
           JOIN \`user\` u ON u.id = ml.user_id
           JOIN \`user\` mu ON mu.id = ml.match_user_id
           ORDER BY ml.id DESC LIMIT ? OFFSET ?`
        : `SELECT ml.*, u.support_code AS user_support_code, u.city AS user_city,
                  mu.support_code AS matched_support_code
           FROM user_match_log ml
           JOIN \`user\` u ON u.id = ml.user_id
           JOIN \`user\` mu ON mu.id = ml.match_user_id
           ORDER BY ml.id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    return success(res, paginate(
      rows.map((row) => formatMatchByRole(row, req.adminRole)),
      count[0].total,
      page,
      pageSize
    ));
  } catch (err) {
    next(err);
  }
});

function parseScoreDetail(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (e) {
    return null;
  }
}

async function loadAdminMatchSide(userId, role) {
  const [users] = await pool.query(
    `SELECT u.*, oc.circle_name
     FROM \`user\` u
     LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
  const includeOpenId = canSeeOpenId(role);
  const base = {
    ...formatUserForAdmin(users[0], { includeOpenId }),
    circle_name: users[0]?.circle_name || '',
  };
  if (role === ADMIN_ROLES.CUSTOMER_SERVICE) {
    return base;
  }
  const [settings] = await pool.query(
    'SELECT * FROM user_match_setting WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return {
    ...base,
    match_settings: settings[0] || null,
  };
}

/** GET /api/admin/matches/:id — 匹配诊断详情（双方资料 + 设置 + 分项分） */
router.get('/matches/:id', async (req, res, next) => {
  try {
    const includeOpenId = canSeeOpenId(req.adminRole);
    const [rows] = await pool.query(
      includeOpenId
        ? `SELECT ml.*, u.openid AS user_openid, u.support_code AS user_support_code,
                  mu.openid AS matched_openid, mu.support_code AS matched_support_code
           FROM user_match_log ml
           JOIN \`user\` u ON u.id = ml.user_id
           JOIN \`user\` mu ON mu.id = ml.match_user_id
           WHERE ml.id = ?
           LIMIT 1`
        : `SELECT ml.*, u.support_code AS user_support_code, u.city AS user_city,
                  mu.support_code AS matched_support_code
           FROM user_match_log ml
           JOIN \`user\` u ON u.id = ml.user_id
           JOIN \`user\` mu ON mu.id = ml.match_user_id
           WHERE ml.id = ?
           LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) return fail(res, '匹配记录不存在', 404, 404);

    const log = rows[0];
    const projectedLog = formatMatchByRole(log, req.adminRole);
    const [owner, partner] = await Promise.all([
      loadAdminMatchSide(log.user_id, req.adminRole),
      loadAdminMatchSide(log.match_user_id, req.adminRole),
    ]);

    if (req.adminRole === ADMIN_ROLES.CUSTOMER_SERVICE) {
      return success(res, {
        log: projectedLog,
        owner,
        partner,
      });
    }

    return success(res, {
      log: includeOpenId ? log : projectedLog,
      owner,
      partner,
      score_detail: parseScoreDetail(log.score_detail_json),
    });
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
    if (Number(report.audit_status) !== 0) {
      await conn.rollback();
      return fail(res, '报备记录已处理');
    }

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
    const { username, password, role } = req.body;
    if (!username || !password) return fail(res, '账号密码不能为空');
    const adminRole = Object.values(ADMIN_ROLES).includes(role)
      ? role
      : ADMIN_ROLES.SUPER_ADMIN;

    const [exists] = await pool.query('SELECT id FROM `admin` WHERE username = ?', [username]);
    if (exists.length > 0) return fail(res, '用户名已存在');

    const [r] = await pool.query(
      'INSERT INTO `admin` (username, password, role) VALUES (?, ?, ?)',
      [username, hashPassword(password), adminRole]
    );
    return success(res, { id: r.insertId, role: adminRole }, '管理员创建成功');
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/whitelist — 管理端脱敏查看单位白名单 */
router.get('/whitelist', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, phone, name, unit, source, used, create_time
       FROM free_whitelist ORDER BY id DESC LIMIT 200`
    );
    return success(res, {
      list: rows.map((row) => ({
        id: row.id,
        phone_masked: maskPhone(row.phone),
        name: row.name || '',
        unit: row.unit || '',
        source: row.source || '',
        used: row.used,
        create_time: row.create_time,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/whitelist/batches — 白名单导入批次审计 */
router.get('/whitelist/batches', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, admin_id, source, unit, received_count, imported_count, create_time
       FROM free_whitelist_import_batch ORDER BY id DESC LIMIT 100`
    );
    return success(res, { list: rows });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/whitelist/import — 批量导入脱敏白名单（幂等，按 phone 去重） */
router.post('/whitelist/import', async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const list = Array.isArray(req.body.list) ? req.body.list : [];
    const ok = ['public', 'edu', 'med'];
    const first = list[0] || {};
    const batchSource = ok.includes(req.body.source) ? req.body.source : (ok.includes(first.source) ? first.source : 'public');
    const batchUnit = String(req.body.unit || first.unit || '').slice(0, 100);
    let inserted = 0;

    await conn.beginTransaction();
    const [batch] = await conn.query(
      `INSERT INTO free_whitelist_import_batch
       (admin_id, source, unit, received_count, imported_count)
       VALUES (?,?,?,?,0)`,
      [req.auth.id || 0, batchSource, batchUnit, list.length]
    );

    for (const r of list) {
      const phone = String(r.phone || '').trim();
      const source = ok.includes(r.source) ? r.source : 'public';
      if (!/^\d{11}$/.test(phone)) continue; // ponytail: 只收 11 位手机号，脏数据跳过
      await conn.query(
        `INSERT INTO free_whitelist (phone, name, unit, source) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), unit=VALUES(unit), source=VALUES(source)`,
        [phone, String(r.name || '').slice(0, 50), String(r.unit || '').slice(0, 100), source]
      );
      inserted += 1;
    }
    await conn.query(
      'UPDATE free_whitelist_import_batch SET imported_count = ? WHERE id = ?',
      [inserted, batch.insertId]
    );
    await conn.commit();
    return success(res, { received: list.length, imported: inserted, batch_id: batch.insertId });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
