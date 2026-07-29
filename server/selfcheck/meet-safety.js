const {
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');
const fs = require('fs');
const path = require('path');

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
    ok('meet create returns share token for family card', /^[A-Za-z0-9_-]{16,80}$/.test(String(created.json.data.share_token || '')));
    const [[meetRow]] = await pool.query('SELECT meet_time, safety_prompt FROM meet_report WHERE id = ?', [created.json.data.id]);
    ok('meet create normalizes user-entered meet_time', String(meetRow.meet_time).includes('2026'));
    ok('meet create stores acknowledged safety prompt text', String(meetRow.safety_prompt || '').includes('白天公共场所'));

    const invalidTime = await request('POST', '/api/meet/create', {
      meet_time: '2026-13-99 18:00',
      meet_place: '自检咖啡店',
      emergency_contact: '13800000000',
      safety_ack: 1,
    }, token);
    ok('meet create rejects invalid meet_time without 500', invalidTime.status === 200 && invalidTime.json.code !== 0);

    const invalidLocation = await request('POST', '/api/meet/create', {
      meet_place: '自检咖啡店',
      lat: 'not-a-number',
      lng: 999,
      emergency_contact: '13800000000',
      safety_ack: 1,
    }, token);
    ok('meet create tolerates invalid optional location without 500', invalidLocation.status === 200 && invalidLocation.json.code === 0 && invalidLocation.json.data.id);
    const [[invalidLocationRow]] = await pool.query('SELECT lat, lng FROM meet_report WHERE id = ?', [invalidLocation.json.data.id]);
    ok('meet create stores invalid optional location as null', invalidLocationRow.lat === null && invalidLocationRow.lng === null);

    const sos = await request('POST', `/api/meet/${created.json.data.id}/sos`, { lat: 22.5, lng: 114.0 }, token);
    ok('meet SOS returns 110 and emergency contact', sos.status === 200 && sos.json.code === 0 && sos.json.data.sosPhone === '110' && sos.json.data.emergency_contact === '13800000000');
    const gd110 = sos.json.data.guangdong110 || {};
    if (process.env.GUANGDONG_110_ENABLED === 'true') {
      ok('meet SOS returns configured Guangdong 110 appId', gd110.enabled === true && gd110.appId === process.env.GUANGDONG_110_APP_ID);
    } else {
      ok('meet SOS returns Guangdong 110 config placeholder', gd110.enabled === false);
    }
    const meetSafetyJs = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'pages', 'meet-safety', 'meet-safety.js'), 'utf8');
    ok('meet safety page can jump to Guangdong 110 mini program when configured', meetSafetyJs.includes('navigateToMiniProgram') && meetSafetyJs.includes('广东110'));
    const safetyConfig = await request('GET', '/api/common/safety-config');
    ok('common safety config returns SOS phone', safetyConfig.status === 200 && safetyConfig.json.code === 0 && safetyConfig.json.data.sosPhone === '110');

    const loc1 = await request('POST', `/api/meet/${created.json.data.id}/location`, {
      lat: 22.501,
      lng: 114.001,
      accuracy: 18,
      source: 'watch',
    }, token);
    ok('meet location upload succeeds', loc1.status === 200 && loc1.json.code === 0);
    const loc2 = await request('POST', `/api/meet/${created.json.data.id}/location`, {
      lat: 22.502,
      lng: 114.002,
      accuracy: 12,
      source: 'watch',
    }, token);
    ok('meet location upload can append timeline points', loc2.status === 200 && loc2.json.code === 0);
    const [[locCount]] = await pool.query('SELECT COUNT(*) AS c FROM meet_location_log WHERE user_id = ? AND meet_report_id = ?', [user.id, created.json.data.id]);
    ok('meet location uploads write timeline rows', locCount.c === 2);
    const loaded = await request('GET', `/api/meet/${created.json.data.id}`, undefined, token);
    ok('meet detail returns location timeline stats', loaded.status === 200 && loaded.json.code === 0 && loaded.json.data.location_count === 2 && loaded.json.data.latest_location_time);
    const shared = await request('GET', `/api/meet/share/${created.json.data.share_token}`);
    ok('meet share card opens without user token', shared.status === 200 && shared.json.code === 0 && shared.json.data.shared === true);
    ok('meet share card hides emergency contact', shared.json.data.emergency_contact === undefined);
    ok('meet share card shows readonly location stats', shared.json.data.location_count === 2 && shared.json.data.latest_location_time);

    const quickSos = await request('POST', '/api/meet/sos', { lat: 22.6, lng: 114.1 }, token);
    ok('home SOS without meet report writes evidence', quickSos.status === 200 && quickSos.json.code === 0 && quickSos.json.data.meet_report_id === 0);

    const finish = await request('POST', `/api/meet/${created.json.data.id}/finish`, undefined, token);
    ok('meet finish succeeds', finish.status === 200 && finish.json.code === 0);
    const [[finished]] = await pool.query('SELECT status FROM meet_report WHERE id = ?', [created.json.data.id]);
    ok('meet finish marks report ended', Number(finished.status) === 1);

    const [[maxMeet]] = await pool.query('SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM meet_report');
    const cancelMissing = await request('POST', `/api/meet/${maxMeet.missing_id}/cancel`, undefined, token);
    ok('meet cancel rejects missing report', cancelMissing.status === 404 && cancelMissing.json.code !== 0);

    const [[count]] = await pool.query('SELECT COUNT(*) AS c FROM sos_log WHERE user_id = ?', [user.id]);
    ok('meet SOS writes sos_log', count.c === 2);
  } finally {
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
