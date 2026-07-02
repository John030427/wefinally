const {
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');

const openids = ['sc_vip_purchase_dev'];

(async () => {
  try {
    await cleanupOpenids(openids);

    if (process.env.NODE_ENV === 'production') {
      console.log('SKIP - dev vip purchase mock is not used in production');
      return;
    }
    if (process.env.WXPAY_MCH_ID || process.env.WXPAY_API_KEY) {
      console.log('SKIP - wxpay is configured, dev mock branch is not active');
      return;
    }

    const user = await createUser({ openid: openids[0], isVip: 0 });
    const token = userToken(user);

    const purchase = await request('POST', '/api/vip/purchase', {}, token);
    ok('dev vip purchase succeeds', purchase.status === 200 && purchase.json.code === 0);
    ok('dev vip purchase does not return mock payment to miniprogram',
      purchase.json.data.mock_paid === true && purchase.json.data.payment == null);
    ok('dev vip purchase marks order paid', purchase.json.data.pay_status === 1);

    const [[row]] = await pool.query(
      'SELECT is_vip, vip_expire_time FROM `user` WHERE openid = ?',
      [openids[0]]
    );
    ok('dev vip purchase grants vip locally', row.is_vip === 1 && row.vip_expire_time);
  } finally {
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
