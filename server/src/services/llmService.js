const axios = require('axios');
const cfg = require('../config/llmConfig');

/** 从一段外貌文本抽 3-8 个结构化标签；未启用/失败返回 null（调用方据此跳过，不影响主流程） */
async function extractAppearanceTags(text) {
  try {
    if (!cfg.enabled || !cfg.apiKey || !cfg.baseURL || !cfg.model || !text) return null;
    const prompt = `把下面这段中文外貌描述抽成3-8个简短中文标签(体型/身高感/风格/气质/五官/穿搭等)，` +
      `只输出 JSON 数组，例如 ["高","文艺","戴眼镜"]。描述：${String(text).slice(0, 500)}`;
    const { data } = await axios.post(
      `${cfg.baseURL}/chat/completions`,
      { model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0 },
      { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: cfg.timeoutMs }
    );
    const out = data?.choices?.[0]?.message?.content || '';
    const m = out.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const tags = JSON.parse(m[0]);
    return Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : null;
    // 不同模型返回结构/字段可能不同，按实际所选模型 API 调整解析。
  } catch (e) {
    console.error('[llm] extractAppearanceTags fail:', e.message);
    return null;
  }
}

module.exports = { extractAppearanceTags };
