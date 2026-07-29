const { clearSampleData, ok, pool } = require('./common');

(async () => {
  try {
    await clearSampleData();
    ok('sample matching data cleared', true);
  } finally {
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
