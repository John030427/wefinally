module.exports = {
  enabled: false, // 拿到模型+霞姐OK+授权后改 true
  baseURL: process.env.LLM_BASE_URL || '', // OpenAI 兼容端点(多数国产模型支持)
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || '',
  timeoutMs: 8000,
};
