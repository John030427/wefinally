process.env.LLM_MOCK_MODE = 'matching_sample';
process.env.AI_RERANK_TOP_K = '1';

const { applyAiRerank } = require('../src/services/matchService');
const { ok } = require('./_helpers');

(async () => {
  const eligible = [
    {
      candidate: { id: 1, openid: 'sample_match_algo_first_f' },
      combined: 96,
      viewSim: 80,
    },
    {
      candidate: { id: 2, openid: 'sample_match_ai_preferred_f' },
      combined: 95,
      viewSim: 90,
    },
  ];
  const reranked = await applyAiRerank({}, eligible);
  ok('ai topk rerank keeps unscored candidates outside rerank window', reranked[0].candidate.id === 1);
  ok('ai topk rerank leaves candidate outside topk without ai weight', reranked[1].aiWeight === undefined);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
