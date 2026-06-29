const pool = require('../config/db');
const { fail } = require('../utils/response');
const { USER_STATUS } = require('../config/constants');

const debounceMap = new Map();
const DEBOUNCE_MS = 800;

function debounce(key) {
  const now = Date.now();
  const last = debounceMap.get(key) || 0;
  if (now - last < DEBOUNCE_MS) return false;
  debounceMap.set(key, now);
  return true;
}

function debounceMiddleware(keyFn) {
  return (req, res, next) => {
    const key = keyFn(req);
    if (!debounce(key)) {
      return fail(res, '操作过于频繁，请稍后再试', 429, 429);
    }
    next();
  };
}

async function loadUser(userId) {
  const [rows] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);
  return rows[0] || null;
}

function isVipActive(user) {
  if (user && user.free_member) return true; // 公益免费会员：永久豁免
  if (!user || user.is_vip !== 1) return false;
  if (!user.vip_expire_time) return false;
  return new Date(user.vip_expire_time) > new Date();
}

function isDivorced(user) {
  return user && user.marry_status === '离异';
}

function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

/** Block banned / married users */
async function requireActiveUser(req, res, next) {
  try {
    const user = await loadUser(req.auth.id);
    if (!user) return fail(res, '用户不存在', 404, 404);
    if (user.status === USER_STATUS.BANNED) {
      return fail(res, '账号已被封禁', 403, 403);
    }
    if (user.status === USER_STATUS.MARRIED) {
      return fail(res, '您已登记结婚，账号已注销', 403, 403);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Divorced users cannot use normal flows — admin must restore */
async function blockDivorcedUser(req, res, next) {
  try {
    const user = req.user || (await loadUser(req.auth.id));
    if (!user) return fail(res, '用户不存在', 404, 404);
    if (isDivorced(user)) {
      return fail(res, '离异用户需联系管理员恢复账号', 403, 403);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireVip(req, res, next) {
  try {
    const user = req.user || (await loadUser(req.auth.id));
    if (!user) return fail(res, '用户不存在', 404, 404);
    if (!isVipActive(user)) {
      return fail(res, '请先开通VIP会员', 403, 403);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  debounce,
  debounceMiddleware,
  requireActiveUser,
  blockDivorcedUser,
  requireVip,
  isVipActive,
  isDivorced,
  loadUser,
  daysSince,
};
