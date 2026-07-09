process.env.LLM_MOCK_MODE = process.env.LLM_MOCK_MODE || 'matching_sample';
process.env.AI_RERANK_TOP_K = '5';

const { runSampleMatching } = require('./run');
const {
  clearSampleData,
  ok,
  pool,
  seedSampleData,
} = require('./common');

(async () => {
  try {
    await clearSampleData();
    await seedSampleData();
    const result = await runSampleMatching();
    ok('sample e2e algorithm matched expected versioned pair', result.summary.algorithmMatched);
    ok('sample e2e ai rerank selected expected candidate', result.summary.aiRerankApplied);
    ok('sample e2e ai report generated', result.summary.aiReportGenerated);
    ok('sample e2e report failure fallback recorded', result.summary.reportFailureFallback);
    ok('sample e2e wave2 cases matched expected pairs', result.summary.wave2AllPassed);
  } finally {
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
