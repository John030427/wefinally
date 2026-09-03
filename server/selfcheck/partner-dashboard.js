const crypto = require('crypto');
const {
  cleanupOpenids,
  cleanupPartnerPhones,
  createUser,
  ok,
  pool,
  request,
  signToken,
  ROLES,
} = require('./_helpers');
const { hashPassword } = require('../src/utils/crypto');
const { PARTNER_STATUS } = require('../src/config/constants');

(async () => {
  const phone = 'sc_partner_dashboard';
  const password = `Sc_${crypto.randomUUID()}`;
  const openids = ['sc_partner_free_member'];

  try {
    await cleanupOpenids(openids);
    await cleanupPartnerPhones([phone]);
    const [result] = await pool.query(
      `INSERT INTO partner
       (circle_id, name, phone, password, status, promote_code, balance)
       VALUES (?, '自检合伙人', ?, ?, ?, 'SCPARTNER1', 188.00)`,
      [9101, phone, hashPassword(password), PARTNER_STATUS.ACTIVE]
    );

    const login = await request('POST', '/api/auth/partner-login', { phone, password });
    ok('partner login succeeds', login.status === 200 && login.json.code === 0);

    const token = signToken({ id: result.insertId, role: ROLES.PARTNER, phone });
    const freeUser = await createUser({ openid: openids[0], freeMember: 1, isVip: 0 });
    await pool.query('UPDATE `user` SET promote_partner_id = ? WHERE id = ?', [result.insertId, freeUser.id]);

    const dashboard = await request('GET', '/api/partner/dashboard', undefined, token);
    ok('partner dashboard succeeds', dashboard.status === 200 && dashboard.json.code === 0);
    ok('partner dashboard hides password', dashboard.json.data.partner.password === undefined);
    ok('partner dashboard counts promoted free_member as vip user', Number(dashboard.json.data.stats.vip_users) === 1);

    const tools = await request('GET', '/api/partner/promote-tools', undefined, token);
    ok('partner promote path points current register page',
      tools.status === 200 &&
      tools.json.data.mini_program_path === '/pages/member-application/member-application?promote_code=SCPARTNER1');
  } finally {
    await cleanupOpenids(openids);
    await cleanupPartnerPhones([phone]);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
