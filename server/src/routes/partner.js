const express = require('express');

const pool = require('../config/db');

const { partnerAuth } = require('../middleware/auth');

const { success, fail, paginate } = require('../utils/response');

const { debounceMiddleware } = require('../middleware/guard');

const { PARTNER_STATUS, USER_STATUS } = require('../config/constants');
const { nextMemberStatus } = require('../utils/memberPolicy');
const { createReferralToken } = require('../../../miniprogram/cloudfunctions/api/lib/partnerReferralPolicy');

const {

  formatPartnerForAdmin,

  formatPartnerUser,

  formatPartnerOrder,

} = require('../utils/apiFormat');



const router = express.Router();



router.use(partnerAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT status FROM partner WHERE id = ?', [req.auth.id]);
    if (!rows.length || rows[0].status !== PARTNER_STATUS.ACTIVE) {
      return fail(res, '合伙人账号已停用', 403, 403);
    }
    next();
  } catch (err) {
    next(err);
  }
});



async function writePartnerAuditLog(partnerId, userId, action, reason) {

  try {

    await pool.query(

      'INSERT INTO partner_user_audit_log (partner_id, user_id, action, reason) VALUES (?, ?, ?, ?)',

      [partnerId, userId, action, reason || '']

    );

  } catch (err) {

    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;

    console.warn('[partner audit] partner_user_audit_log 表不存在，请执行 database/patch-002-partner-audit.sql');

  }

}



/** GET /api/partner/dashboard */

router.get('/dashboard', async (req, res, next) => {

  try {

    const partnerId = req.auth.id;

    const [partner] = await pool.query(
      `SELECT id, circle_id, name, phone, status, promote_code,
              total_promote_user, total_promote_vip, total_commission,
              balance, create_time, update_time
       FROM \`partner\` WHERE id = ?`,
      [partnerId]
    );

    if (partner.length === 0) return fail(res, '合伙人不存在', 404, 404);



    const [[users]] = await pool.query(

      'SELECT COUNT(*) AS c FROM `user` WHERE promote_partner_id = ?',

      [partnerId]

    );

    const [[vipUsers]] = await pool.query(

      `SELECT COUNT(*) AS c FROM \`user\`

       WHERE promote_partner_id = ?
         AND (free_member = 1 OR (is_vip = 1 AND vip_expire_time > NOW()))`,

      [partnerId]

    );

    const [[orders]] = await pool.query(

      `SELECT COUNT(*) AS c, COALESCE(SUM(partner_commission), 0) AS total_commission

       FROM user_order WHERE partner_id = ? AND pay_status = 1`,

      [partnerId]

    );

    const [[pending]] = await pool.query(

      'SELECT COUNT(*) AS c FROM partner_withdraw WHERE partner_id = ? AND status = 0',

      [partnerId]

    );



    return success(res, {

      partner: formatPartnerForAdmin(partner[0]),

      stats: {

        promoted_users: users.c,

        vip_users: vipUsers.c,

        paid_orders: orders.c,

        total_commission: Number(orders.total_commission),

        pending_withdrawals: pending.c,

      },

    });

  } catch (err) {

    next(err);

  }

});



/** GET /api/partner/users */

router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Number(req.query.pageSize) || 10);
    const offset = (page - 1) * pageSize;
    const memberStatus = req.query.member_status || req.query.status;
    let where = 'WHERE u.promote_partner_id = ?';
    const params = [req.auth.id];
    if (memberStatus !== undefined && memberStatus !== '') {
      where += ' AND u.member_status = ?';
      params.push(String(memberStatus));
    }
    const [count] = await pool.query(`SELECT COUNT(*) AS total FROM \`user\` u ${where}`, params);
    const [rows] = await pool.query(
      `SELECT u.id, u.gender, u.birth_year, u.status, u.member_status, u.is_vip,
              u.vip_expire_time, u.create_time, u.city, u.marry_status, u.openid,
              u.occupation_description,
              (SELECT ma.id FROM member_application ma WHERE ma.user_id = u.id ORDER BY ma.revision DESC LIMIT 1) AS application_id,
              (SELECT ma.review_note FROM member_application ma WHERE ma.user_id = u.id ORDER BY ma.revision DESC LIMIT 1) AS review_note
       FROM \`user\` u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return success(res, paginate(rows.map(formatPartnerUser), count[0].total, page, pageSize));
  } catch (err) {
    next(err);
  }
});



/** PUT /api/partner/users/:id/audit */

router.put('/users/:id/audit', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const userId = Number(req.params.id);
    const { action, reason } = req.body;
    const [users] = await conn.query(
      'SELECT * FROM `user` WHERE id = ? AND promote_partner_id = ?',
      [userId, req.auth.id]
    );
    if (!users.length) return fail(res, '用户不存在或不属于您的邀请', 404, 404);
    const [applications] = await conn.query(
      'SELECT * FROM member_application WHERE user_id = ? ORDER BY revision DESC LIMIT 1',
      [userId]
    );
    const application = applications[0] || null;
    if (action === 'view') {
      return success(res, {
        user: formatPartnerUser(users[0]),
        application,
        note: '审核操作会保留意见和状态变更记录'
      });
    }
    if (!application) return fail(res, '用户尚未提交会员申请');
    const reviewReason = String(reason || '').trim().slice(0, 500);
    if (['need_more_info', 'reject', 'disable'].includes(action) && !reviewReason) {
      return fail(res, '请填写审核意见');
    }
    let nextStatus;
    try {
      nextStatus = nextMemberStatus(application.status, action);
    } catch (err) {
      return fail(res, err.message);
    }
    await conn.beginTransaction();
    await conn.query(
      `UPDATE member_application SET status = ?, review_note = ?, reviewed_by_role = 'partner',
       reviewed_by_id = ?, reviewed_at = NOW() WHERE id = ?`,
      [nextStatus, reviewReason, req.auth.id, application.id]
    );
    await conn.query(
      'UPDATE `user` SET member_status = ?, member_status_updated_at = NOW() WHERE id = ?',
      [nextStatus, userId]
    );
    await conn.query(
      `INSERT INTO partner_user_audit_log
       (partner_id, user_id, application_id, actor_role, actor_id, action, from_status, to_status, reason)
       VALUES (?, ?, ?, 'partner', ?, ?, ?, ?, ?)`,
      [req.auth.id, userId, application.id, req.auth.id, action, application.status, nextStatus, reviewReason]
    );
    await conn.commit();
    const [updated] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);
    return success(res, { user: formatPartnerUser(updated[0]), member_status: nextStatus }, '审核状态已更新');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/member-audit-logs', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM partner_user_audit_log WHERE partner_id = ? ORDER BY id DESC LIMIT 100',
      [req.auth.id]
    );
    return success(res, { list: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/invite-assets', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT promote_code FROM partner WHERE id = ?', [req.auth.id]);
    const code = rows[0]?.promote_code || '';
    return success(res, {
      promote_code: code,
      miniprogram_path: `/pages/register/register?promote_code=${encodeURIComponent(code)}`,
      scene: code
    });
  } catch (err) {
    next(err);
  }
});



/** POST /api/partner/withdraw */

router.post(

  '/withdraw',

  debounceMiddleware((req) => `withdraw:${req.auth.id}`),

  async (req, res, next) => {

    const conn = await pool.getConnection();

    try {

      const { amount } = req.body;

      const withdrawAmount = Number(amount);

      if (!withdrawAmount || withdrawAmount <= 0) return fail(res, '提现金额无效');



      await conn.beginTransaction();

      const [partners] = await conn.query(

        'SELECT * FROM `partner` WHERE id = ? FOR UPDATE',

        [req.auth.id]

      );

      if (partners.length === 0) throw new Error('合伙人不存在');

      const partner = partners[0];



      if (partner.status !== PARTNER_STATUS.ACTIVE) {

        await conn.rollback();

        return fail(res, '账号未激活，无法提现');

      }

      if (Number(partner.balance) < withdrawAmount) {

        await conn.rollback();

        return fail(res, '余额不足');

      }



      await conn.query(

        'UPDATE `partner` SET balance = balance - ? WHERE id = ?',

        [withdrawAmount, req.auth.id]

      );

      const [result] = await conn.query(

        'INSERT INTO partner_withdraw (partner_id, amount, status) VALUES (?, ?, 0)',

        [req.auth.id, withdrawAmount]

      );

      await conn.commit();



      return success(res, { id: result.insertId, amount: withdrawAmount }, '提现申请已提交');

    } catch (err) {

      await conn.rollback();

      next(err);

    } finally {

      conn.release();

    }

  }

);



/** GET /api/partner/withdrawals */

router.get('/withdrawals', async (req, res, next) => {

  try {

    const [rows] = await pool.query(

      'SELECT * FROM partner_withdraw WHERE partner_id = ? ORDER BY id DESC LIMIT 50',

      [req.auth.id]

    );

    return success(res, rows.map((r) => ({

      ...r,

      created_at: r.create_time,

    })));

  } catch (err) {

    next(err);

  }

});



/** GET /api/partner/promote-tools */

router.get('/promote-tools', async (req, res, next) => {

  try {

    const [partner] = await pool.query(

      'SELECT promote_code, name FROM `partner` WHERE id = ?',

      [req.auth.id]

    );

    if (partner.length === 0) return fail(res, '合伙人不存在', 404, 404);



    const code = partner[0].promote_code;
    let referral = code;
    if (process.env.PARTNER_REFERRAL_SECRET) {
      try { referral = createReferralToken(req.auth.id); } catch (err) { referral = code; }
    }

    return success(res, {

      promote_code: code,
      attribution_token: referral === code ? '' : referral,
      mini_program_path: `/pages/register/register?promote_code=${encodeURIComponent(referral)}`,
      scene: referral,

      share_title: 'WeFinally · 遇见对的人',

      share_desc: '高端婚恋匹配，AI 智能推荐',

      qrcode_tip: '请将推广码配置到小程序码参数 scene 中',

    });

  } catch (err) {

    next(err);

  }

});



/** GET /api/partner/orders */

router.get('/orders', async (req, res, next) => {

  try {

    const [rows] = await pool.query(

      `SELECT order_no, price, partner_commission, pay_status, settle_status, pay_time, create_time

       FROM user_order WHERE partner_id = ? ORDER BY id DESC LIMIT 50`,

      [req.auth.id]

    );

    return success(res, rows.map(formatPartnerOrder));

  } catch (err) {

    next(err);

  }

});



module.exports = router;

