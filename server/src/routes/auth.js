const express = require('express');
const axios = require('axios');
const pool = require('../config/db');
const { signToken } = require('../middleware/auth');
const { fail, success } = require('../utils/response');
const { hashPassword, comparePassword, generatePromoteCode } = require('../utils/crypto');
const { isVipActive, isDivorced } = require('../middleware/guard');
const { createDevWxSession, isDevWxLoginEnabled } = require('../services/devWxLogin');
const {
  ROLES,
  ADMIN_ROLES,
  USER_STATUS,
  PARTNER_STATUS,
} = require('../config/constants');

const router = express.Router();

async function wxCode2Session(code, devOpenid = '') {
  if (isDevWxLoginEnabled()) {
    return createDevWxSession(code, process.env, devOpenid);
  }

  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) {
    throw new Error('微信配置缺失');
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
  const { data } = await axios.get(url);
  if (data.errcode) {
    throw new Error(data.errmsg || '微信登录失败');
  }
  return data;
}

async function isOpenidBlacklisted(openid) {
  const [rows] = await pool.query(
    'SELECT openid FROM openid_blacklist WHERE openid = ? LIMIT 1',
    [openid]
  );
  return rows.length > 0;
}

function sanitizeUser(u) {
  const vip = isVipActive(u);
  return {
    id: u.id,
    openid: u.openid,
    gender: u.gender,
    birth_year: u.birth_year,
    height_range: u.height_range,
    education: u.education,
    circle_id: u.circle_id,
    city: u.city,
    marry_status: u.marry_status,
    baby_plan: u.baby_plan,
    income_range: u.income_range,
    house_car: u.house_car,
    status: u.status,
    is_vip: vip ? 1 : 0,
    isVip: vip,
    vip_expire_time: u.vip_expire_time,
    promote_partner_id: u.promote_partner_id,
    promote_code: u.promote_code,
    isRegistered: u.status !== USER_STATUS.PENDING || !!u.birth_year,
  };
}

/** POST /api/auth/wx-login */
router.post('/wx-login', async (req, res, next) => {
  try {
    const { code, devOpenid } = req.body;
    if (!code) return fail(res, '缺少 code');

    const wx = await wxCode2Session(code, devOpenid);

    if (await isOpenidBlacklisted(wx.openid)) {
      return fail(res, '账号已被限制注册/登录', 403, 403);
    }

    const [rows] = await pool.query('SELECT * FROM `user` WHERE openid = ?', [wx.openid]);

    if (rows.length === 0) {
      return success(res, {
        needRegister: true,
        openid: wx.openid,
        userInfo: { isRegistered: false },
      });
    }

    const user = rows[0];
    if (user.status === USER_STATUS.BANNED) return fail(res, '账号已被封禁', 403, 403);
    if (isDivorced(user)) {
      return fail(res, '离异用户需联系管理员恢复账号，无法自助登录', 403, 403);
    }

    const token = signToken({ id: user.id, role: ROLES.USER, openid: user.openid });
    const userInfo = sanitizeUser(user);
    return success(res, { token, user: userInfo, userInfo, needRegister: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/partner-login — phone + password */
router.post('/partner-login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return fail(res, '请输入手机号和密码');

    const [rows] = await pool.query('SELECT * FROM `partner` WHERE phone = ?', [phone]);
    if (rows.length === 0) return fail(res, '账号或密码错误', 401, 401);

    const partner = rows[0];
    if (!comparePassword(password, partner.password)) {
      return fail(res, '账号或密码错误', 401, 401);
    }
    if (partner.status === PARTNER_STATUS.FROZEN) {
      return fail(res, '账号待管理员授权', 403, 403);
    }
    if (partner.status === PARTNER_STATUS.DISABLED) {
      return fail(res, '账号已禁用', 403, 403);
    }

    const token = signToken({ id: partner.id, role: ROLES.PARTNER, phone });
    return success(res, {
      token,
      partner: {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        circle_id: partner.circle_id,
        promote_code: partner.promote_code,
        balance: partner.balance,
        total_commission: partner.total_commission,
        status: partner.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/admin-login */
router.post('/admin-login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return fail(res, '请输入账号密码');

    const [rows] = await pool.query(
      'SELECT * FROM `admin` WHERE username = ? AND status = 1',
      [username]
    );
    if (rows.length === 0) return fail(res, '账号或密码错误', 401, 401);

    const admin = rows[0];
    if (!comparePassword(password, admin.password)) {
      return fail(res, '账号或密码错误', 401, 401);
    }

    const adminRole = admin.role || ADMIN_ROLES.SUPER_ADMIN;
    const token = signToken({ id: admin.id, role: ROLES.ADMIN, username, admin_role: adminRole });
    return success(res, {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: adminRole,
        admin_role: adminRole,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/partner-register */
router.post('/partner-register', async (req, res, next) => {
  try {
    const { circle_id, name, phone, password } = req.body;
    if (!circle_id || !name || !phone || !password) {
      return fail(res, '请填写圈层、姓名、手机号和密码');
    }

    const [circleExists] = await pool.query(
      'SELECT id FROM occupation_circle WHERE id = ? AND status = 1',
      [circle_id]
    );
    if (circleExists.length === 0) return fail(res, '圈层不存在或已禁用');

    const [circleTaken] = await pool.query(
      'SELECT id FROM `partner` WHERE circle_id = ?',
      [circle_id]
    );
    if (circleTaken.length > 0) return fail(res, '该圈层已有合伙人');

    const [phoneExists] = await pool.query('SELECT id FROM `partner` WHERE phone = ?', [phone]);
    if (phoneExists.length > 0) return fail(res, '手机号已注册');

    const promoteCode = generatePromoteCode();
    const [result] = await pool.query(
      `INSERT INTO \`partner\`
       (circle_id, name, phone, password, status, promote_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [circle_id, name, phone, hashPassword(password), PARTNER_STATUS.FROZEN, promoteCode]
    );

    return success(res, {
      id: result.insertId,
      promote_code: promoteCode,
      status: PARTNER_STATUS.FROZEN,
    }, '注册成功，等待管理员审核');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
