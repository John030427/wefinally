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

function compactUserForReport(user) {
  return {
    gender: user.gender,
    birth_year: user.birth_year,
    height_range: user.height_range,
    education: user.education,
    city: user.city,
    baby_plan: user.baby_plan,
    circle_id: user.circle_id,
  };
}

async function generateMatchReport(viewer, partner, scoreDetail) {
  try {
    if (!cfg.matchReportEnabled) return { status: 3, text: null, error: 'disabled' };
    if (!cfg.apiKey || !cfg.baseURL || !cfg.model) return { status: 2, text: null, error: 'missing llm config' };

    const payload = {
      viewer: compactUserForReport(viewer),
      partner: compactUserForReport(partner),
      score: scoreDetail,
    };
    const prompt = [
      '你是严肃婚恋平台的匹配报告助手。基于脱敏资料和算法分数，给当前用户写一份中文匹配报告。',
      '要求：不做心理诊断，不承诺成功率，不泄露双方三观原文，不编造姓名/头像/收入。',
      '结构：1.匹配亮点 2.需要磨合 3.首次沟通建议。总字数120-180字。',
      `资料JSON：${JSON.stringify(payload).slice(0, 3500)}`,
    ].join('\n');

    const { data } = await axios.post(
      `${cfg.baseURL}/chat/completions`,
      { model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 },
      { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: cfg.timeoutMs }
    );
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) return { status: 2, text: null, error: 'empty llm response' };
    return { status: 1, text: text.slice(0, 1000), error: '', usage: data?.usage || null };
  } catch (e) {
    console.error('[llm] generateMatchReport fail:', e.message);
    return { status: 2, text: null, error: e.message };
  }
}

module.exports = { extractAppearanceTags, generateMatchReport };
