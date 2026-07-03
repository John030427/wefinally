const {
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');

const openids = ['sc_meet_user'];

(async () => {
  let user;
  try {
    await cleanupOpenids(openids);
    user = await createUser({ openid: openids[0] });
    const token = userToken(user);

    const rejected = await request('POST', '/api/meet/create', {
      meet_place: '自检咖啡店',
      emergency_contact: '13800000000',
    }, token);
    ok('meet create rejects missing safety_ack', rejected.status === 200 && rejected.json.code !== 0);

    const created = await request('POST', '/api/meet/create', {
      meet_time: '2026-9-01 18：00',
      meet_place: '自检咖啡店',
      lat: 22.5,
      lng: 114.0,
      emergency_contact: '13800000000',
      safety_ack: 1,
    }, token);
    ok('meet create succeeds with safety_ack', created.status === 200 && created.json.code === 0 && created.json.data.id);
    const [[meetRow]] = await pool.query('SELECT meet_time FROM meet_report WHERE id = ?', [created.json.data.id]);
    ok('meet create normalizes user-entered meet_time', String(meetRow.meet_time).includes('2026'));

    const invalidTime = await request('POST', '/api/meet/create', {
      meet_time: '2026-13-99 18:00',
      meet_place: '自检咖啡店',
      emergency_contact: '13800000000',
      safety_ack: 1,
    }, token);
    ok('meet create rejects invalid meet_time without 500', invalidTime.status === 200 && invalidTime.json.code !== 0);

    const sos = await request('POST', `/api/meet/${created.json.data.id}/sos`, { lat: 22.5, lng: 114.0 }, token);
    ok('meet SOS returns 110 and emergency contact', sos.status === 200 && sos.json.code === 0 && sos.json.data.sosPhone === '110' && sos.json.data.emergency_contact === '13800000000');

    const [[count]] = await pool.query('SELECT COUNT(*) AS c FROM sos_log WHERE user_id = ?', [user.id]);
    ok('meet SOS writes sos_log', count.c === 1);
  } finally {
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
