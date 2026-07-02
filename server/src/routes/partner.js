const express = require('express');

const pool = require('../config/db');

const { partnerAuth } = require('../middleware/auth');

const { success, fail, paginate } = require('../utils/response');

const { debounceMiddleware } = require('../middleware/guard');

const { PARTNER_STATUS, USER_STATUS } = require('../config/constants');

const {

  formatPartnerForAdmin,

  formatPartnerUser,

  formatPartnerOrder,

} = require('../utils/apiFormat');



const router = express.Router();



router.use(partnerAuth);



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

       WHERE promote_partner_id = ? AND is_vip = 1 AND vip_expire_time > NOW()`,

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

    const status = req.query.status;



    let where = 'WHERE promote_partner_id = ?';

    const params = [req.auth.id];

    if (status !== undefined && status !== '') {

      where += ' AND status = ?';

      params.push(Number(status));

    }



    const [count] = await pool.query(`SELECT COUNT(*) AS total FROM \`user\` ${where}`, params);

    const [rows] = await pool.query(

      `SELECT id, gender, birth_year, status, is_vip, vip_expire_time, create_time, city, marry_status, openid

       FROM \`user\` ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,

      [...params, pageSize, offset]

    );



    return success(res, paginate(rows.map(formatPartnerUser), count[0].total, page, pageSize));

  } catch (err) {

    next(err);

  }

});



/** PUT /api/partner/users/:id/audit */

router.put('/users/:id/audit', async (req, res, next) => {

  try {

    const userId = Number(req.params.id);

    const { action, reason } = req.body;



    const [users] = await pool.query(

      'SELECT * FROM `user` WHERE id = ? AND promote_partner_id = ?',

      [userId, req.auth.id]

    );

    if (users.length === 0) return fail(res, '用户不存在或不属于您的推广', 404, 404);



    const user = users[0];



    if (action === 'view') {

      return success(res, {

        user: formatPartnerUser(user),

        note: '请核实用户注册信息后通过或驳回，操作将留痕',

      });

    }



    if (action === 'approve') {

      if (user.status !== USER_STATUS.PENDING) {

        return fail(res, '该用户不在待审核状态');

      }

      await pool.query('UPDATE `user` SET status = ? WHERE id = ?', [USER_STATUS.NORMAL, userId]);

      await writePartnerAuditLog(req.auth.id, userId, 'approve', reason);

      const [updated] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);

      return success(res, { user: formatPartnerUser(updated[0]) }, '已通过审核');

    }



    if (action === 'reject') {

      await pool.query('UPDATE `user` SET status = ? WHERE id = ?', [USER_STATUS.BANNED, userId]);

      await writePartnerAuditLog(req.auth.id, userId, 'reject', reason);

      const [updated] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);

      return success(res, { user: formatPartnerUser(updated[0]) }, '已驳回');

    }



    return fail(res, '无效操作');

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

    return success(res, {

      promote_code: code,

      mini_program_path: `/pages/register/register?promote_code=${code}`,

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

