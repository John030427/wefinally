const axios = require('axios');
const cfg = require('../config/llmConfig');

function isMatchingSampleMock() {
  return (process.env.LLM_MOCK_MODE || cfg.mockMode) === 'matching_sample';
}

function realLlmReady(featureEnabled) {
  return Boolean(cfg.enabled && featureEnabled && cfg.apiKey && cfg.baseURL && cfg.model);
}

function mockReportText() {
  return [
    '你们这组匹配的现实基础比较稳：生活节奏、婚育安排和见面成本都有可落地的部分，适合从一次轻量沟通开始确认真实感受。',
    '从三观和关系偏好看，更重要的是双方能不能在沟通方式、安全感、家庭边界和长期规划上形成稳定共识。外貌偏好只作为自述与期待的契合参考，不做颜值判断。',
    '真正需要提前聊的是未来城市安排、父母边界和家庭财务规划。第一次沟通可以从“未来三年想怎么生活”“婚后和双方父母保持什么距离”“家庭财务怎么规划”开始。',
  ].join('\n\n');
}

function hasMockReportFailure(userA, userB) {
  return [userA?.openid, userB?.openid].some((openid) => String(openid || '').includes('report_fail'));
}

function mockAiScore(item, index) {
  const openid = String(item?.candidate?.openid || '');
  if (openid.includes('ai_preferred')) return { ai_score: 98, reason: '样本AI重排：沟通节奏与关系偏好更稳' };
  if (openid.includes('algo_first')) return { ai_score: 58, reason: '样本AI重排：算法高分但需要更多确认' };
  return { ai_score: Math.max(55, 86 - index * 6), reason: '样本AI重排：综合资料较稳' };
}

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
    if (!cfg.matchReportEnabled || !cfg.enabled) return { status: 3, text: null, error: 'disabled' };
    if (!realLlmReady(cfg.matchReportEnabled)) return { status: 2, text: null, error: 'missing llm config' };

    const payload = {
      viewer: compactUserForReport(viewer),
      partner: compactUserForReport(partner),
      score: scoreDetail,
    };
    const prompt = [
      '你是严肃婚恋平台的匹配报告助手。基于脱敏资料和算法分数，给当前用户写一份中文匹配报告。',
      '要求：不做心理诊断，不承诺成功率，不泄露双方三观原文，不编造姓名/头像/收入。',
      '输出风格：第一段讲现实基础和为什么值得见面；第二段讲三观、沟通方式、安全感、家庭边界、金钱观、事业家庭优先级上的贴合或磨合；第三段讲需要提前聊清楚的地方和2-3个具体话题。',
      '不要写分数，不要写“系统认为”，不要泛泛写“条件匹配”。不要透露具体收入、职位、单位。每份180-260字。',
      '外貌偏好可作为双方自述与期待的契合度参考，但不要写成颜值判断。',
      '可用解释映射：城市匹配=见面和落地成本低；学历匹配=沟通语境和成长路径接近；婚育匹配=关系推进时间表一致；职业圈层=日常节奏和现实压力是否互相理解；三观心理=相处方式能不能长期磨合。',
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

async function generateMutualMatchReports(userA, userB, scoreDetailA, scoreDetailB) {
  try {
    if (isMatchingSampleMock()) {
      if (hasMockReportFailure(userA, userB)) {
        return {
          status: 2,
          a: { text: null, error: 'mock report failure' },
          b: { text: null, error: 'mock report failure' },
          usage: { mock: true },
        };
      }
      return {
        status: 1,
        a: { text: mockReportText(), error: '' },
        b: { text: mockReportText(), error: '' },
        usage: { mock: true },
      };
    }
    if (!cfg.matchReportEnabled || !cfg.enabled) {
      return {
        status: 3,
        a: { text: null, error: 'disabled' },
        b: { text: null, error: 'disabled' },
        usage: null,
      };
    }
    if (!realLlmReady(cfg.matchReportEnabled)) {
      return {
        status: 2,
        a: { text: null, error: 'missing llm config' },
        b: { text: null, error: 'missing llm config' },
        usage: null,
      };
    }

    const payload = {
      userA: compactUserForReport(userA),
      userB: compactUserForReport(userB),
      scoreA: scoreDetailA,
      scoreB: scoreDetailB,
    };
    const prompt = [
      '你是严肃婚恋平台的匹配报告助手。基于脱敏资料和算法分数，分别给A、B写面向本人的中文匹配报告。',
      '要求：不做心理诊断，不承诺成功率，不泄露双方三观原文，不编造姓名/头像/收入。',
      '输出风格：第一段讲现实基础和为什么值得见面；第二段讲三观、沟通方式、安全感、家庭边界、金钱观、事业家庭优先级上的贴合或磨合；第三段讲需要提前聊清楚的地方和2-3个具体话题。',
      '不要写分数，不要写“系统认为”，不要泛泛写“条件匹配”。不要透露具体收入、职位、单位。每份180-260字。',
      '外貌偏好可作为双方自述与期待的契合度参考，但不要写成颜值判断。',
      '可用解释映射：城市匹配=见面和落地成本低；学历匹配=沟通语境和成长路径接近；婚育匹配=关系推进时间表一致；职业圈层=日常节奏和现实压力是否互相理解；三观心理=相处方式能不能长期磨合。',
      '只输出JSON对象，格式：{"a":"给A看的报告","b":"给B看的报告"}',
      `资料JSON：${JSON.stringify(payload).slice(0, 5000)}`,
    ].join('\n');

    const { data } = await axios.post(
      `${cfg.baseURL}/chat/completions`,
      { model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 },
      { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: cfg.timeoutMs }
    );
    const out = String(data?.choices?.[0]?.message?.content || '');
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) {
      return { status: 2, a: { text: null, error: 'missing json object' }, b: { text: null, error: 'missing json object' }, usage: data?.usage || null };
    }
    const parsed = JSON.parse(m[0]);
    const a = String(parsed.a || '').trim();
    const b = String(parsed.b || '').trim();
    if (!a || !b) {
      return { status: 2, a: { text: null, error: 'empty report' }, b: { text: null, error: 'empty report' }, usage: data?.usage || null };
    }
    return {
      status: 1,
      a: { text: a.slice(0, 1000), error: '' },
      b: { text: b.slice(0, 1000), error: '' },
      usage: data?.usage || null,
    };
  } catch (e) {
    console.error('[llm] generateMutualMatchReports fail:', e.message);
    return { status: 2, a: { text: null, error: e.message }, b: { text: null, error: e.message }, usage: null };
  }
}

async function rerankMatchCandidates(viewer, candidates) {
  try {
    if (isMatchingSampleMock()) {
      const scores = {};
      candidates.slice(0, cfg.aiRerankTopK).forEach((item, index) => {
        const id = Number(item?.candidate?.id);
        if (!id) return;
        scores[id] = mockAiScore(item, index);
      });
      return { status: 1, scores, usage: { mock: true }, error: '' };
    }
    if (!cfg.aiWeightEnabled || !cfg.enabled) return { status: 3, scores: {}, usage: null, error: 'disabled' };
    if (!realLlmReady(cfg.aiWeightEnabled)) return { status: 2, scores: {}, usage: null, error: 'missing llm config' };
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { status: 1, scores: {}, usage: null, error: '' };
    }

    const payload = {
      viewer: compactUserForReport(viewer),
      candidates: candidates.slice(0, cfg.aiRerankTopK).map((item) => ({
        candidate_id: item.candidate.id,
        algorithm_score: Math.round(Math.min(100, item.combined) * 100) / 100,
        view_similarity: item.viewSim,
        score_detail: item.scoreAB?.detail || null,
        candidate: compactUserForReport(item.candidate),
      })),
    };
    const prompt = [
      '你是严肃婚恋平台的候选重排助手。只基于脱敏资料和算法分数，给每个候选一个0-100的ai_score。',
      '要求：不要做心理诊断，不承诺成功率，不输出解释之外的多余文字。',
      '只输出JSON数组，格式：[{"candidate_id":1,"ai_score":82,"reason":"简短原因"}]',
      `资料JSON：${JSON.stringify(payload).slice(0, 5000)}`,
    ].join('\n');

    const { data } = await axios.post(
      `${cfg.baseURL}/chat/completions`,
      { model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0 },
      { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: cfg.timeoutMs }
    );
    const out = String(data?.choices?.[0]?.message?.content || '');
    const m = out.match(/\[[\s\S]*\]/);
    if (!m) return { status: 2, scores: {}, usage: data?.usage || null, error: 'missing json array' };
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return { status: 2, scores: {}, usage: data?.usage || null, error: 'json is not array' };

    const scores = {};
    for (const row of arr) {
      const id = Number(row.candidate_id);
      const score = Math.max(0, Math.min(100, Number(row.ai_score)));
      if (id && Number.isFinite(score)) {
        scores[id] = {
          ai_score: Math.round(score * 100) / 100,
          reason: String(row.reason || '').slice(0, 120),
        };
      }
    }
    return { status: 1, scores, usage: data?.usage || null, error: '' };
  } catch (e) {
    console.error('[llm] rerankMatchCandidates fail:', e.message);
    return { status: 2, scores: {}, usage: null, error: e.message };
  }
}

module.exports = {
  extractAppearanceTags,
  generateMatchReport,
  generateMutualMatchReports,
  isMatchingSampleMock,
  realLlmReady,
  rerankMatchCandidates,
};
