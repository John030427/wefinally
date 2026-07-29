const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../src/utils/crypto');
const {
  BASE_URL,
  adminToken,
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
  signToken,
} = require('./_helpers');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'admin', 'index.html'), 'utf8');
const adminRoute = fs.readFileSync(path.join(root, 'src', 'routes', 'admin.js'), 'utf8');
const authRoute = fs.readFileSync(path.join(root, 'src', 'routes', 'auth.js'), 'utf8');
const constants = fs.readFileSync(path.join(root, 'src', 'config', 'constants.js'), 'utf8');
const initSql = fs.readFileSync(path.join(root, '..', 'database', 'init.sql'), 'utf8');

const openids = ['sc_service_user_a', 'sc_service_user_b'];
const serviceAdminUsername = 'sc_service_admin';
const serviceAdminPassword = 'sc_service_pass_123';

function serviceToken() {
  return signToken({
    id: 901,
    role: 'admin',
    username: 'service_selfcheck',
    admin_role: 'customer_service',
  });
}

async function seedServiceData() {
  await cleanupOpenids(openids);
  const user = await createUser({ openid: openids[0], gender: 1, isVip: 1 });
  const partner = await createUser({ openid: openids[1], gender: 2, isVip: 1 });
  await pool.query(
    `INSERT INTO ai_chat_log (user_id, user_content, ai_content, is_manual_transfer)
     VALUES (?, '需要人工客服', '已转人工客服', 1)`,
    [user.id]
  );
  const [match] = await pool.query(
    `INSERT INTO user_match_log
     (user_id, match_user_id, view_similarity, total_score, match_date, match_type)
     VALUES (?, ?, 90, 96, '2099-03-01', '客服自检匹配')`,
    [user.id, partner.id]
  );
  await pool.query(
    `INSERT INTO match_handoff_ticket (match_log_id, user_id, match_user_id, status, service_note)
     VALUES (?, ?, ?, 'submitted', '客服自检')`,
    [match.insertId, user.id, partner.id]
  );
  await pool.query(
    `INSERT INTO user_order
     (user_id, order_no, price, partner_commission, platform_income, circle_id, partner_id, pay_status, settle_status, pay_time)
     VALUES (?, 'SC_SERVICE_ORDER_001', 188, 0, 188, 1, 0, 1, 0, NOW())`,
    [user.id]
  );
  return { user, partner };
}

ok('admin constants define service admin role',
  constants.includes('ADMIN_ROLES') && constants.includes('CUSTOMER_SERVICE'));
ok('admin init sql has role column',
  initSql.includes('`role`') && initSql.includes('super_admin'));
ok('admin login returns admin role',
  authRoute.includes('admin_role') && authRoute.includes('admin.role'));
ok('admin route has role-aware access guard',
  adminRoute.includes('requireAdminAccess') && adminRoute.includes('ADMIN_ROLES.CUSTOMER_SERVICE'));
ok('admin route exposes service workbench API',
  adminRoute.includes("router.get('/service/workbench'"));
ok('admin web exposes service workbench nav',
  html.includes('data-p="service"') && html.includes('客服工作台'));
ok('admin web renders service workbench',
  html.includes('function pgService') && html.includes('/admin/service/workbench'));
ok('admin web stores and applies admin role',
  html.includes('wf_admin_role') && html.includes('applyRoleNav'));

(async () => {
  try {
    const { user } = await seedServiceData();
    await pool.query('DELETE FROM admin WHERE username = ?', [serviceAdminUsername]);
    await pool.query(
      'INSERT INTO admin (username, password, role, status) VALUES (?, ?, ?, 1)',
      [serviceAdminUsername, hashPassword(serviceAdminPassword), 'customer_service']
    );
    const login = await request('POST', '/api/auth/admin-login', {
      username: serviceAdminUsername,
      password: serviceAdminPassword,
    });
    ok('customer service admin login returns role',
      login.status === 200
        && login.json.code === 0
        && login.json.data.admin.role === 'customer_service'
        && login.json.data.admin.admin_role === 'customer_service'
        && login.json.data.token);

    const service = serviceToken();

    const workbench = await request('GET', '/api/admin/service/workbench', undefined, service);
    ok('customer service can open workbench',
      workbench.status === 200
        && workbench.json.code === 0
        && Array.isArray(workbench.json.data.orders)
        && Array.isArray(workbench.json.data.handoff_tickets)
        && Array.isArray(workbench.json.data.chat_sessions));

    const orders = await request('GET', '/api/admin/orders?pageSize=5', undefined, service);
    ok('customer service can inspect orders',
      orders.status === 200 && orders.json.code === 0 && Array.isArray(orders.json.data.list));

    const sessions = await request('GET', '/api/admin/chat/sessions', undefined, service);
    ok('customer service can inspect manual chat sessions',
      sessions.status === 200 && sessions.json.code === 0 && Array.isArray(sessions.json.data));

    const tickets = await request('GET', '/api/admin/handoff/tickets', undefined, service);
    ok('customer service can inspect official handoff tickets',
      tickets.status === 200 && tickets.json.code === 0 && Array.isArray(tickets.json.data));

    const reply = await request('POST', '/api/admin/chat/reply', {
      session_id: user.id,
      content: '客服自检回复',
    }, service);
    ok('customer service can reply chat',
      reply.status === 200 && reply.json.code === 0);

    const deniedExport = await request('GET', '/api/admin/export/orders', undefined, service);
    ok('customer service cannot export orders',
      deniedExport.status === 403 && deniedExport.json.code === 403);

    const deniedUserUpdate = await request('PUT', `/api/admin/users/${user.id}`, {
      status: 2,
    }, service);
    ok('customer service cannot mutate users',
      deniedUserUpdate.status === 403 && deniedUserUpdate.json.code === 403);

    const deniedWhitelist = await request('POST', '/api/admin/whitelist/import', {
      list: [],
    }, service);
    ok('customer service cannot import whitelist',
      deniedWhitelist.status === 403 && deniedWhitelist.json.code === 403);

    const superAdmin = await fetch(`${BASE_URL}/api/admin/export/orders`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    ok('super admin keeps export permission',
      superAdmin.status === 200);
  } finally {
    await pool.query('DELETE FROM admin WHERE username = ?', [serviceAdminUsername]).catch(() => {});
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await cleanupOpenids(openids).catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
