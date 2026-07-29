const jwt = require('jsonwebtoken');
const { fail } = require('../utils/response');
const { ROLES } = require('../config/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-token'] || null;
}

function authRequired(role) {
  return (req, res, next) => {
    try {
      const token = extractToken(req);
      if (!token) return fail(res, '未登录', 401, 401);

      const decoded = verifyToken(token);
      if (role && decoded.role !== role) {
        return fail(res, '无权访问', 403, 403);
      }

      req.auth = decoded;
      next();
    } catch (err) {
      return fail(res, '登录已过期', 401, 401);
    }
  };
}

const userAuth = authRequired(ROLES.USER);
const partnerAuth = authRequired(ROLES.PARTNER);
const adminAuth = authRequired(ROLES.ADMIN);

/** Allow user OR admin (admin can impersonate read ops) */
function userOrAdmin(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return fail(res, '未登录', 401, 401);
    const decoded = verifyToken(token);
    if (decoded.role !== ROLES.USER && decoded.role !== ROLES.ADMIN) {
      return fail(res, '无权访问', 403, 403);
    }
    req.auth = decoded;
    next();
  } catch (err) {
    return fail(res, '登录已过期', 401, 401);
  }
}

module.exports = {
  signToken,
  verifyToken,
  extractToken,
  authRequired,
  userAuth,
  partnerAuth,
  adminAuth,
  userOrAdmin,
};
