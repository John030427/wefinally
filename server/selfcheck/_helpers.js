require('dotenv').config();

const pool = require('../src/config/db');
const { signToken } = require('../src/middleware/auth');
const { ROLES, USER_STATUS } = require('../src/config/constants');

const BASE_URL = process.env.SELFCHECK_BASE_URL || 'http://localhost:3000';

function ok(name, condition) {
  if (!condition) throw new Error(`FAIL - ${name}`);
  console.log(`PASS - ${name}`);
}

function scOnly(value, label = 'value') {
  if (!String(value).startsWith('sc_')) throw new Error(`${label} must start with sc_`);
}

function testPhoneOnly(phone) {
  if (!/^1380000\d{4}$/.test(String(phone))) {
    throw new Error(`phone must be a 1380000xxxx selfcheck number: ${phone}`);
  }
}

function placeholders(items) {
  return items.map(() => '?').join(',');
}

function userToken(user) {
  return signToken({ id: user.id, role: ROLES.USER, openid: user.openid });
}

function adminToken() {
  return signToken({ id: 1, role: ROLES.ADMIN, username: 'selfcheck' });
}

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`${method} ${path} returned non-JSON: ${text.slice(0, 120)}`);
  }
  return { status: res.status, json };
}

async function createUser({
  openid,
  gender = 1,
  birthYear = 1995,
  isVip = 0,
  freeMember = 0,
  status = USER_STATUS.NORMAL,
} = {}) {
  scOnly(openid, 'openid');
  await cleanupOpenids([openid]);
  const vipExpire = isVip ? new Date(Date.now() + 30 * 86400000) : null;
  const [result] = await pool.query(
    `INSERT INTO \`user\`
     (openid, gender, birth_year, height_range, education, circle_id, city,
      marry_status, baby_plan, status, is_vip, vip_expire_time, free_member)
     VALUES (?, ?, ?, '170-180cm', '本科', 1, '深圳', '未婚', '3-5y', ?, ?, ?, ?)`,
    [openid, gender, birthYear, status, isVip, vipExpire, freeMember]
  );
  return { id: result.insertId, openid };
}

async function cleanupOpenids(openids) {
  if (!openids.length) return;
  openids.forEach((openid) => scOnly(openid, 'openid'));
  const [users] = await pool.query(
    `SELECT id FROM \`user\` WHERE openid IN (${placeholders(openids)})`,
    openids
  );
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const qs = placeholders(ids);
    await pool.query(`DELETE FROM match_handoff_ticket WHERE user_id IN (${qs}) OR match_user_id IN (${qs})`, [...ids, ...ids]).catch(() => {});
    await pool.query(`DELETE FROM meet_location_log WHERE user_id IN (${qs})`, ids).catch(() => {});
    await pool.query(`DELETE FROM sos_log WHERE user_id IN (${qs})`, ids).catch(() => {});
    await pool.query(`DELETE FROM meet_report WHERE user_id IN (${qs})`, ids).catch(() => {});
    await pool.query(`DELETE FROM user_match_log WHERE user_id IN (${qs}) OR match_user_id IN (${qs})`, [...ids, ...ids]).catch(() => {});
    await pool.query(`DELETE FROM user_match_setting WHERE user_id IN (${qs})`, ids).catch(() => {});
    await pool.query(`DELETE FROM user_privacy_auth_log WHERE user_id IN (${qs})`, ids).catch(() => {});
    await pool.query(`DELETE FROM marry_report WHERE user_id IN (${qs})`, ids).catch(() => {});
    await pool.query(`DELETE FROM user_order WHERE user_id IN (${qs})`, ids).catch(() => {});
  }
  await pool.query(
    `DELETE FROM \`user\` WHERE openid IN (${placeholders(openids)})`,
    openids
  );
}

async function cleanupPhones(phones) {
  if (!phones.length) return;
  phones.forEach(testPhoneOnly);
  await pool.query(
    `DELETE FROM free_whitelist WHERE phone IN (${placeholders(phones)})`,
    phones
  ).catch(() => {});
}

async function cleanupPartnerPhones(phones) {
  if (!phones.length) return;
  phones.forEach((phone) => scOnly(phone, 'partner phone'));
  const [partners] = await pool.query(
    `SELECT id FROM partner WHERE phone IN (${placeholders(phones)})`,
    phones
  );
  const ids = partners.map((p) => p.id);
  if (ids.length) {
    await pool.query(
      `DELETE FROM partner_withdraw WHERE partner_id IN (${placeholders(ids)})`,
      ids
    ).catch(() => {});
  }
  await pool.query(`DELETE FROM partner WHERE phone IN (${placeholders(phones)})`, phones);
}

module.exports = {
  BASE_URL,
  ROLES,
  USER_STATUS,
  adminToken,
  cleanupOpenids,
  cleanupPartnerPhones,
  cleanupPhones,
  createUser,
  ok,
  pool,
  request,
  signToken,
  userToken,
};
