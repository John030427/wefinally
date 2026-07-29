process.env.LLM_MOCK_MODE = 'matching_sample';
delete process.env.AI_RERANK_TOP_K;

const { ok } = require('./_helpers');
const {
  generateMutualMatchReports,
  rerankMatchCandidates,
} = require('../src/services/llmService');

(async () => {
  const rerank = await rerankMatchCandidates(
    { openid: 'sample_match_viewer' },
    [
      { combined: 96, viewSim: 90, candidate: { id: 1, openid: 'sample_match_algo_first' }, scoreAB: { detail: { baby: 30 } } },
      { combined: 88, viewSim: 88, candidate: { id: 2, openid: 'sample_match_ai_preferred' }, scoreAB: { detail: { baby: 20 } } },
    ]
  );

  ok('mock ai rerank returns enabled result', rerank.status === 1);
  ok('mock ai rerank can prefer configured sample candidate', rerank.scores[2].ai_score > rerank.scores[1].ai_score && rerank.scores[2].reason.includes('样本'));

  const report = await generateMutualMatchReports(
    { openid: 'sample_match_a', city: '深圳' },
    { openid: 'sample_match_b', city: '深圳' },
    { version: 'algo_evidence_v2', side: { baby: 30 } },
    { version: 'algo_evidence_v2', side: { baby: 30 } }
  );

  ok('mock mutual report succeeds', report.status === 1 && report.a.text && report.b.text);
  ok('mock mutual report keeps marriage report style', report.a.text.includes('你们这组匹配的现实基础') && report.a.text.includes('真正需要提前聊的是'));
  ok('mock mutual report avoids raw scoring copy', !report.a.text.includes('/30') && !report.a.text.includes('系统认为'));

  const failed = await generateMutualMatchReports(
    { openid: 'sample_match_report_fail_a' },
    { openid: 'sample_match_report_fail_b' },
    {},
    {}
  );
  ok('mock mutual report can simulate failure fallback', failed.status === 2 && failed.a.error.includes('mock'));
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
