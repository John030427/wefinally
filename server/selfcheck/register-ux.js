const { hashPassword } = require('../src/utils/crypto');
const {
  cleanupOpenids,
  cleanupPartnerPhones,
  ok,
  pool,
  request,
} = require('./_helpers');

const openids = ['sc_reg_empty_promo', 'sc_reg_valid_promo', 'sc_reg_bad_promo', 'sc_divorce_review'];
const partnerPhones = ['sc_regux_partner'];
const promoteCode = 'SCUX1234';

const registerBase = {
  gender: '男',
  birth_year: 1995,
  height_range: '170-180cm',
  education: '本科',
  city: '深圳',
  circle_id: 1,
  baby_plan: '3-5年内',
  marry_status: '未婚',
  agreements: ['user_service', 'privacy', 'data_auth'],
  device_info: 'selfcheck register ux',
};

async function cleanup() {
  await cleanupOpenids(openids);
  await pool.query(
    `DELETE FROM marry_report WHERE openid IN (${openids.map(() => '?').join(',')})`,
    openids
  ).catch(() => {});
  await pool.query('DELETE FROM partner WHERE promote_code = ?', [promoteCode]).catch(() => {});
  await cleanupPartnerPhones(partnerPhones);
}

async function insertPartner() {
  await cleanupPartnerPhones(partnerPhones);
  await pool.query('DELETE FROM partner WHERE promote_code = ?', [promoteCode]).catch(() => {});
  const [[circle]] = await pool.query(
    `SELECT oc.id
     FROM occupation_circle oc
     LEFT JOIN partner p ON p.circle_id = oc.id
     WHERE p.id IS NULL
     ORDER BY oc.id DESC
     LIMIT 1`
  );
  if (!circle) throw new Error('no available occupation_circle for register-ux selfcheck partner');
  const [r] = await pool.query(
    `INSERT INTO partner (circle_id, name, phone, password, status, promote_code)
     VALUES (?, '注册体验自检合伙人', ?, ?, 1, ?)`,
    [circle.id, partnerPhones[0], hashPassword('scpass'), promoteCode]
  );
  return r.insertId;
}

(async () => {
  try {
    await cleanup();
    const partnerId = await insertPartner();

    const circles = await request('GET', '/api/common/circles');
    ok('circles include plate_name for grouped picker', circles.status === 200
      && circles.json.code === 0
      && Array.isArray(circles.json.data)
      && circles.json.data.length === 50
      && circles.json.data.every((c) => c.plate_name));

    const emptyPromo = await request('POST', '/api/user/register', {
      ...registerBase,
      openid: openids[0],
      promote_code: '',
    });
    ok('empty promote_code can register without partner binding', emptyPromo.status === 200 && emptyPromo.json.code === 0);
    const [[emptyUser]] = await pool.query('SELECT promote_partner_id, promote_code FROM `user` WHERE openid = ?', [openids[0]]);
    ok('empty promote_code stores no partner binding', emptyUser.promote_partner_id === 0 && emptyUser.promote_code === '');

    const promoCheck = await request('GET', `/api/common/promote-code?code=${promoteCode}`);
    ok('valid promote_code lookup succeeds', promoCheck.status === 200
      && promoCheck.json.code === 0
      && promoCheck.json.data.valid === true
      && promoCheck.json.data.partner_id === partnerId
      && promoCheck.json.data.promote_code === promoteCode);

    const validPromo = await request('POST', '/api/user/register', {
      ...registerBase,
      openid: openids[1],
      promote_code: promoteCode,
    });
    ok('valid promote_code can register', validPromo.status === 200 && validPromo.json.code === 0);
    const [[promoUser]] = await pool.query('SELECT promote_partner_id, promote_code FROM `user` WHERE openid = ?', [openids[1]]);
    ok('valid promote_code binds active partner', promoUser.promote_partner_id === partnerId && promoUser.promote_code === promoteCode);

    const invalidPromo = await request('POST', '/api/user/register', {
      ...registerBase,
      openid: openids[2],
      promote_code: 'NO_SUCH_CODE',
    });
    ok('invalid promote_code blocks only when filled', invalidPromo.status === 200 && invalidPromo.json.code !== 0);

    const divorceRegister = await request('POST', '/api/user/register', {
      ...registerBase,
      openid: openids[3],
      marry_status: '离异',
    });
    ok('normal register still rejects divorced users', divorceRegister.status === 403 && divorceRegister.json.code === 403);

    const noReview = await request('GET', `/api/user/divorce-review/status?openid=${openids[3]}`);
    ok('divorce review status starts as not submitted', noReview.status === 200
      && noReview.json.code === 0
      && noReview.json.data.status === 'not_submitted');

    const submitReview = await request('POST', '/api/user/divorce-review', {
      openid: openids[3],
      contact_phone: '13800009999',
      review_note: '离异复入自检申请',
      device_info: 'selfcheck register ux',
    });
    ok('divorce review submit succeeds', submitReview.status === 200 && submitReview.json.code === 0);

    const pendingReview = await request('GET', `/api/user/divorce-review/status?openid=${openids[3]}`);
    ok('divorce review status becomes pending', pendingReview.status === 200
      && pendingReview.json.code === 0
      && pendingReview.json.data.status === 'pending'
      && pendingReview.json.data.audit_status === 0);
  } finally {
    await cleanup();
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
