module.exports = {
  enabled: false, // 拿到模型+霞姐OK+授权后改 true
  baseURL: process.env.LLM_BASE_URL || '', // OpenAI 兼容端点(多数国产模型支持)
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || '',
  timeoutMs: 8000,
  matchReportEnabled: process.env.LLM_MATCH_REPORT_ENABLED === 'true',
  aiWeightEnabled: process.env.AI_MATCH_WEIGHT_ENABLED === 'true',
  aiRerankTopK: Math.max(1, Math.min(20, Number(process.env.AI_RERANK_TOP_K) || 5)),
};
