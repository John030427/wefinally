const { ok, pool, seedSampleData } = require('./common');

(async () => {
  try {
    await seedSampleData();
    ok('sample matching data seeded', true);
  } finally {
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
