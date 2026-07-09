const crypto = require('crypto');
const pool = require('../config/db');
const { computeViewSimilarity } = require('../utils/viewSimilarity');
const { scorePsychProfile } = require('../utils/psychMatch');
const { USER_STATUS } = require('../config/constants');
const cfg = require('../config/matchConfig');
const llmCfg = require('../config/llmConfig');
const { sendMatchNotice } = require('./wxNotify');
const { generateMutualMatchReports, isMatchingSampleMock, rerankMatchCandidates } = require('./llmService');

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function harmonicMean(ab, ba) {
  const a = Number(ab || 0);
  const b = Number(ba || 0);
  if (a <= 0 || b <= 0) return 0;
  return round2((2 * a * b) / (a + b));
}

const COMBINE = harmonicMean;

function batchLockName(batchDate, options = {}) {
  const scope = options.onlyUserId ? `user_${options.onlyUserId}` : (options.scopeOpenidPrefix || 'all');
  const hash = crypto.createHash('sha1').update(`${batchDate}|${scope}`).digest('hex').slice(0, 32);
  return `wefinal_match_${hash}`;
}

async function acquireBatchLock(conn, batchDate, options = {}) {
  const lockName = batchLockName(batchDate, options);
  const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS locked', [lockName]);
  if (Number(rows[0]?.locked) !== 1) {
    throw new Error(`match batch already running: ${batchDate}`);
  }
  return lockName;
}

async function releaseBatchLock(conn, lockName) {
  if (!lockName) return;
  await conn.query('SELECT RELEASE_LOCK(?) AS released', [lockName])
    .catch((e) => console.error('[match batch] release lock fail:', e.message));
}

function eduRank(edu) {
  return cfg.educationRank[edu] ?? 0; // ponytail: 未知学历按最低算
}

function settingsOf(row) {
  return {
    age_min: row.age_min,
    age_max: row.age_max,
    height_min: row.height_min,
    height_max: row.height_max,
    min_education: row.min_education,
    like_circle_ids: row.like_circle_ids,
    like_marry_status: row.like_marry_status,
    like_baby_plan: row.like_baby_plan,
    like_income: row.like_income,
    like_house_car: row.like_house_car,
    psych_profile_json: row.psych_profile_json,
  };
}

function calcAge(birthYear) {
  if (!birthYear) return null;
  return new Date().getFullYear() - Number(birthYear);
}

// 区间或精确身高 → 数值（区间取中位数，避免区间化后匹配分漂移）。"190cm以上" → 190。
function parseHeightCm(heightRange) {
  if (!heightRange) return null;
  const nums = String(heightRange).match(/\d+/g);
  if (!nums) return null;
  return nums.length >= 2 ? (Number(nums[0]) + Number(nums[1])) / 2 : Number(nums[0]);
}

/**
 * 硬性条件：开启的项不满足直接一票否决（仅当设了对应偏好才校验）。双向各调用一次。
 */
function hardOk(settings, candidate) {
  const H = cfg.hard;
  if (H.age && settings.age_min != null && settings.age_max != null) {
    const age = calcAge(candidate.birth_year);
    if (age != null && (age < settings.age_min || age > settings.age_max)) return false;
  }
  if (H.height && settings.height_min != null && settings.height_max != null) {
    const h = parseHeightCm(candidate.height_range);
    if (h != null && (h < settings.height_min || h > settings.height_max)) return false;
  }
  if (H.minEducation && settings.min_education) {
    if (eduRank(candidate.education) < eduRank(settings.min_education)) return false;
  }
  return true;
}

function circleMatches(likeCircleIds, circleId) {
  if (!likeCircleIds) return true;
  const ids = String(likeCircleIds).split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return true;
  return ids.includes(String(circleId));
}

function parseTags(s) {
  try {
    const a = JSON.parse(s || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

const APPEARANCE_KEYWORDS = [
  '清爽', '自然', '干净', '整洁', '运动', '健身', '阳光', '健康',
  '文艺', '简洁', '休闲', '时尚', '精致', '成熟', '商务', '稳重',
  '温柔', '可爱', '高挑', '偏高', '匀称', '苗条', '微胖', '戴眼镜',
  '长发', '短发', '白净', '亲和', '大方', '有气质'
];

function normalizeAppearanceTerm(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function uniqueTerms(items) {
  return [...new Set(items.map(normalizeAppearanceTerm).filter((item) => item.length >= 2))];
}

function extractLocalAppearanceTags(text) {
  const value = normalizeAppearanceTerm(text);
  if (!value) return [];
  return uniqueTerms(APPEARANCE_KEYWORDS.filter((keyword) => value.includes(keyword)));
}

function appearanceTerms(row, tagKey, textKey) {
  return uniqueTerms([
    ...parseTags(row[tagKey]),
    ...extractLocalAppearanceTags(row[textKey]),
  ]);
}

function termsMatch(want, have) {
  return want === have || want.includes(have) || have.includes(want);
}

function scoreAppearancePreference(user, candidate) {
  const want = appearanceTerms(user, 'appearance_want_tags', 'appearance_want');
  const have = appearanceTerms(candidate, 'appearance_tags', 'appearance_description');
  if (!want.length || !have.length) return 0;
  const matched = want.filter((w) => have.some((h) => termsMatch(w, h))).length;
  return matched / want.length;
}

function dimension(key, label, max, rawScore, extra = {}) {
  const raw = round2(rawScore);
  return {
    key,
    label,
    max,
    raw_score: raw,
    percent: max ? Math.min(100, Math.round((raw / max) * 100)) : 0,
    ...extra,
  };
}

function scorePairEvidenceV2(user, settings, candidate, viewSim, config = cfg) {
  const W = config.weights;
  const detail = {};
  const dimensions = {};
  let score = 0;

  const likeBaby = settings.like_baby_plan === '不限' ? null : settings.like_baby_plan;
  if (likeBaby && candidate.baby_plan === likeBaby) detail.baby = W.baby;
  else if (!likeBaby) detail.baby = 10;
  else detail.baby = 0;
  dimensions.baby = dimension('baby', '婚育节奏', W.baby, detail.baby);
  score += detail.baby;

  detail.view = Math.round((viewSim / 100) * W.view * 100) / 100;
  dimensions.view = dimension('view', '三观文本', W.view, detail.view, { similarity: Number(viewSim || 0) });
  score += detail.view;

  const psych = scorePsychProfile(settings.psych_profile_json, candidate.psych_profile_json);
  detail.psych = psych.compared ? Math.round((psych.score / 100) * (W.psych || 0) * 100) / 100 : 0;
  detail.psych_score = psych.score;
  detail.psych_compared = psych.compared;
  detail.psych_detail = psych.detail;
  dimensions.psych = dimension('psych', '关系偏好', W.psych || 0, detail.psych, {
    compatibility_score: psych.score,
    compared: psych.compared,
    detail: psych.detail,
  });
  score += detail.psych;

  const cAge = calcAge(candidate.birth_year);
  if (cAge != null && settings.age_min != null && settings.age_max != null) {
    if (cAge >= settings.age_min && cAge <= settings.age_max) detail.age = W.age;
    else {
      const dist = Math.min(Math.abs(cAge - settings.age_min), Math.abs(cAge - settings.age_max));
      detail.age = Math.max(0, W.age - dist * 2);
    }
  } else {
    detail.age = 5;
  }
  dimensions.age = dimension('age', '年龄区间', W.age, detail.age);
  score += detail.age;

  const cHeight = parseHeightCm(candidate.height_range);
  if (cHeight && settings.height_min && settings.height_max) {
    if (cHeight >= settings.height_min && cHeight <= settings.height_max) detail.height = W.height;
    else {
      const dist = Math.min(
        Math.abs(cHeight - settings.height_min),
        Math.abs(cHeight - settings.height_max)
      );
      detail.height = Math.max(0, W.height - dist);
    }
  } else {
    detail.height = 3;
  }
  dimensions.height = dimension('height', '身高区间', W.height, detail.height);
  score += detail.height;

  if (settings.min_education) {
    detail.education = eduRank(candidate.education) >= eduRank(settings.min_education) ? W.education : 0;
  } else {
    detail.education = 2;
  }
  dimensions.education = dimension('education', '学历偏好', W.education, detail.education);
  score += detail.education;

  detail.circle = circleMatches(settings.like_circle_ids, candidate.circle_id) ? W.circle : 2;
  dimensions.circle = dimension('circle', '职业圈层', W.circle, detail.circle);
  score += detail.circle;

  detail.city = user.city && candidate.city === user.city ? W.city : 1;
  dimensions.city = dimension('city', '城市距离', W.city, detail.city);
  score += detail.city;

  if (config.useAppearanceInMatch) {
    const overlap = scoreAppearancePreference(user, candidate);
    detail.appearance = Math.round((W.appearance || 0) * overlap * 100) / 100;
    score += detail.appearance;
  } else {
    detail.appearance = 0;
  }
  dimensions.appearance = dimension('appearance', '外貌偏好', W.appearance || 0, detail.appearance);

  const maxTotal = Object.values(W).reduce((sum, value) => sum + Number(value || 0), 0);
  const total = round2(score);

  return {
    version: 'algo_evidence_v2',
    total,
    maxTotal,
    normalizedTotal: maxTotal ? Math.min(100, Math.round((total / maxTotal) * 100)) : 0,
    detail,
    dimensions,
  };
}

function scorePairDetail(user, settings, candidate, viewSim) {
  return scorePairEvidenceV2(user, settings, candidate, viewSim);
}

/**
 * Score weights: baby_plan > view_similarity > age/height > education > circle > city
 * 满分权重读 matchConfig.weights；else 分支的基础分为兜底，保持原值（ponytail: 主权重可调即可）。
 */
function scorePair(user, settings, candidate, viewSim) {
  return scorePairDetail(user, settings, candidate, viewSim).total;
}

function psychGateFails(detail, gate) {
  const compared = Number(detail?.psych_compared || 0);
  if (compared < Number(gate.minPsychCompared || 0)) return false;
  const score = Number(detail?.psych_score);
  return Number.isFinite(score) && score < Number(gate.minPsychScore || 0);
}

function passesQualityGate(scoreAB, scoreBA, viewSim) {
  const gate = cfg.qualityGate || {};
  const sideA = Number(scoreAB?.total || 0);
  const sideB = Number(scoreBA?.total || 0);
  const reasons = [];

  if (gate.enabled === false) {
    const legacyMin = Number(cfg.minSideScore || 0);
    if (Math.min(sideA, sideB) < legacyMin) reasons.push('side_score');
    return { pass: reasons.length === 0, reasons };
  }

  if (Math.min(sideA, sideB) < Number(gate.minSideScore || 0)) reasons.push('side_score');
  if (Number(viewSim || 0) < Number(gate.minViewSimilarity || 0)) reasons.push('view_similarity');
  if (psychGateFails(scoreAB?.detail, gate) || psychGateFails(scoreBA?.detail, gate)) {
    reasons.push('psych_score');
  }

  return { pass: reasons.length === 0, reasons };
}

async function applyAiRerank(user, eligible) {
  if (!eligible.length) return eligible;
  eligible.sort((a, b) => b.combined - a.combined || b.viewSim - a.viewSim);
  eligible.forEach((item, index) => { item.algorithmRank = index + 1; });

  const topK = eligible.slice(0, llmCfg.aiRerankTopK);
  const rest = eligible.slice(llmCfg.aiRerankTopK);
  const rerank = await rerankMatchCandidates(user, topK);
  if (rerank.status === 3) return eligible;
  if (rerank.status !== 1) {
    topK[0].aiWeight = { status: rerank.status, fallback: true, error: rerank.error || '' };
    return eligible;
  }

  for (const item of topK) {
    const ai = rerank.scores[item.candidate.id];
    if (!ai) continue;
    const algorithmScore = Math.min(100, item.combined);
    const finalScore = Math.round((algorithmScore * 0.7 + ai.ai_score * 0.3) * 100) / 100;
    item.aiWeight = {
      status: 1,
      algorithm_score: algorithmScore,
      ai_score: ai.ai_score,
      final_score: finalScore,
      reason: ai.reason || '',
    };
    item.sortScore = finalScore;
  }

  topK.sort((a, b) => (b.sortScore ?? b.combined) - (a.sortScore ?? a.combined) || b.viewSim - a.viewSim);
  const ranked = [...topK, ...rest];
  ranked.forEach((item, index) => { item.aiRank = index + 1; });
  return ranked;
}

function aiWeightForSide(aiWeight, viewerSide) {
  if (!aiWeight) return null;
  const out = { ...aiWeight };
  if (out.status === 1) {
    out.scope = viewerSide ? 'viewer_candidate_rerank' : 'partner_reference_only';
    if (!viewerSide) {
      out.reason = '';
      out.note = 'AI重排基于对方候选池，仅用于排序参考，不代表本方独立AI评分。';
    }
  }
  return out;
}

function scopedOpenidClause(options, alias = 'u') {
  if (!options || !options.scopeOpenidPrefix) return { sql: '', params: [] };
  return {
    sql: ` AND ${alias}.openid LIKE ?`,
    params: [`${options.scopeOpenidPrefix}%`],
  };
}

async function getActiveVipUsers(conn, options = {}) {
  const scope = scopedOpenidClause(options);
  const onlyUserSql = options.onlyUserId ? ' AND u.id = ?' : '';
  const onlyUserParams = options.onlyUserId ? [options.onlyUserId] : [];
  const [rows] = await conn.query(
    `SELECT u.*, ms.age_min, ms.age_max, ms.height_min, ms.height_max,
            ms.min_education, ms.like_circle_ids, ms.like_marry_status,
            ms.like_baby_plan, ms.like_income, ms.like_house_car,
            ms.self_view_text, ms.target_view_text, ms.psych_profile_json
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.status = ?
       AND (u.free_member = 1 OR (u.is_vip = 1 AND u.vip_expire_time > NOW()))
       AND u.marry_status != '离异'${scope.sql}${onlyUserSql}
     ORDER BY u.id ASC`,
    [USER_STATUS.NORMAL, ...scope.params, ...onlyUserParams]
  );
  return rows;
}

async function getCandidates(conn, user, options = {}) {
  const targetGender = user.gender === 1 ? 2 : 1;
  const scope = scopedOpenidClause(options);
  const [rows] = await conn.query(
    `SELECT u.*, ms.age_min, ms.age_max, ms.height_min, ms.height_max,
            ms.min_education, ms.like_circle_ids, ms.like_marry_status,
            ms.like_baby_plan, ms.like_income, ms.like_house_car,
            ms.self_view_text, ms.target_view_text, ms.psych_profile_json
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.id != ?
       AND u.status = ?
       AND u.gender = ?
       AND u.marry_status != '离异'${scope.sql}
     ORDER BY u.id ASC`,
    [user.id, USER_STATUS.NORMAL, targetGender, ...scope.params]
  );
  return rows;
}

/**
 * Run matching for all active VIP users for a batch date.
 * Each user receives at most 1 match per batch.
 */
async function runBatchMatch(batchDate, matchType, options = {}) {
  const conn = await pool.getConnection();
  let matched = 0;
  let users = 0;
  let lockName = null;

  try {
    lockName = await acquireBatchLock(conn, batchDate, options);
    await conn.beginTransaction();
    const vipUsers = await getActiveVipUsers(conn, options);
    const usedThisBatch = new Set();
    const notices = [];
    const reports = [];

    for (const user of vipUsers) {
      if (usedThisBatch.has(user.id)) continue;

      const [already] = await conn.query(
        'SELECT id FROM user_match_log WHERE user_id = ? AND match_date = ? LIMIT 1',
        [user.id, batchDate]
      );
      if (already.length > 0) {
        usedThisBatch.add(user.id);
        continue;
      }

      const settingsA = settingsOf(user);
      const candidates = await getCandidates(conn, user, options);
      if (candidates.length === 0) continue;

      users += 1;
      const scored = [];
      for (const c of candidates) {
        if (usedThisBatch.has(c.id)) continue;

        const [cHas] = await conn.query(
          'SELECT id FROM user_match_log WHERE user_id = ? AND match_date = ? LIMIT 1',
          [c.id, batchDate]
        );
        if (cHas.length > 0) continue;

        // 硬性条件：双向必须互相满足（设了才校验），否则直接排除
        if (!hardOk(settingsA, c) || !hardOk(settingsOf(c), user)) continue;
        if (cfg.avoidRematch && !options.allowRematch) {
          const [seen] = await conn.query(
            `SELECT 1 FROM user_match_log
             WHERE (user_id = ? AND match_user_id = ?) OR (user_id = ? AND match_user_id = ?)
             LIMIT 1`,
            [user.id, c.id, c.id, user.id]
          );
          if (seen.length) continue;
        }

        const viewSim = computeViewSimilarity(
          user.self_view_text,
          user.target_view_text,
          c.self_view_text,
          c.target_view_text
        );
        const scoreAB = scorePairDetail(user, settingsA, c, viewSim);
        const scoreBA = scorePairDetail(c, settingsOf(c), user, viewSim);
        const quality = passesQualityGate(scoreAB, scoreBA, viewSim);
        scored.push({
          candidate: c,
          viewSim,
          scoreAB,
          scoreBA,
          combined: COMBINE(scoreAB.total, scoreBA.total),
          quality,
        });
      }

      let eligible = scored.filter((s) => s.quality.pass);
      let usingQualityFallback = false;
      if (
        eligible.length === 0
        && (cfg.smallPoolFallback || options.allowQualityFallback)
        && (cfg.qualityGate?.allowSmallPoolFallback !== false)
      ) {
        scored.forEach((s) => { s.qualityFallback = true; });
        eligible = scored;
        usingQualityFallback = true;
      }
      if (usingQualityFallback) {
        eligible.sort((a, b) => b.combined - a.combined || b.viewSim - a.viewSim);
        eligible.forEach((item, index) => { item.algorithmRank = index + 1; item.aiRank = index + 1; });
      } else {
        eligible = await applyAiRerank(user, eligible);
      }
      const best = eligible[0];
      if (!best) continue;
      const initialReportStatus = (!isMatchingSampleMock() && (!llmCfg.enabled || !llmCfg.matchReportEnabled)) ? 3 : 0;
      const initialReportError = initialReportStatus === 3 ? 'disabled' : '';

      const scoreDetailA = {
        version: 'algo_evidence_v2',
        total: best.scoreAB.total,
        max_total: best.scoreAB.maxTotal,
        normalized_total: best.scoreAB.normalizedTotal,
        mutual_total: best.combined,
        view_similarity: best.viewSim,
        algorithm_rank: best.algorithmRank || 1,
        ai_rank: best.aiRank || best.algorithmRank || 1,
        ai_weight: aiWeightForSide(best.aiWeight, true),
        report_status: initialReportStatus,
        quality_gate: {
          pass: best.quality.pass,
          reasons: best.quality.reasons,
          fallback: Boolean(best.qualityFallback),
        },
        side: { ...best.scoreAB.detail, dimensions: best.scoreAB.dimensions },
      };
      const scoreDetailB = {
        version: 'algo_evidence_v2',
        total: best.scoreBA.total,
        max_total: best.scoreBA.maxTotal,
        normalized_total: best.scoreBA.normalizedTotal,
        mutual_total: best.combined,
        view_similarity: best.viewSim,
        algorithm_rank: best.algorithmRank || 1,
        ai_rank: best.aiRank || best.algorithmRank || 1,
        ai_weight: aiWeightForSide(best.aiWeight, false),
        report_status: initialReportStatus,
        quality_gate: {
          pass: best.quality.pass,
          reasons: best.quality.reasons,
          fallback: Boolean(best.qualityFallback),
        },
        side: { ...best.scoreBA.detail, dimensions: best.scoreBA.dimensions },
      };
      const [inserted] = await conn.query(
        `INSERT INTO user_match_log
         (user_id, match_user_id, view_similarity, total_score, score_detail_json, score_version,
          ai_report_status, ai_report_error, match_date, match_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id, best.candidate.id, best.viewSim, best.scoreAB.total,
          JSON.stringify(scoreDetailA), 'algo_evidence_v2', initialReportStatus, initialReportError, batchDate, matchType,
          best.candidate.id, user.id, best.viewSim, best.scoreBA.total,
          JSON.stringify(scoreDetailB), 'algo_evidence_v2', initialReportStatus, initialReportError, batchDate, matchType,
        ]
      );
      usedThisBatch.add(user.id);
      usedThisBatch.add(best.candidate.id);
      notices.push({ openid: user.openid, date: batchDate, type: matchType });
      notices.push({ openid: best.candidate.openid, date: batchDate, type: matchType });
      reports.push({
        logAId: inserted.insertId,
        logBId: inserted.insertId + 1,
        userA: user,
        userB: best.candidate,
        scoreDetailA,
        scoreDetailB,
      });
      matched += 1;
    }

    await conn.commit();
    for (const r of reports) {
      const report = await generateMutualMatchReports(r.userA, r.userB, r.scoreDetailA, r.scoreDetailB);
      const now = report.status === 1 ? new Date() : null;
      r.scoreDetailA.report_status = report.status;
      r.scoreDetailB.report_status = report.status;
      const updates = [
        [r.logAId, report.a, r.scoreDetailA],
        [r.logBId, report.b, r.scoreDetailB],
      ];
      for (const [logId, item, detail] of updates) {
        await pool.query(
          `UPDATE user_match_log
           SET ai_report_text = ?, ai_report_status = ?, ai_report_error = ?, ai_report_time = ?, score_detail_json = ?
           WHERE id = ?`,
          [
            item.text || null,
            report.status,
            String(item.error || '').slice(0, 255),
            now,
            JSON.stringify(detail),
            logId,
          ]
        ).catch((e) => console.error('[match report] update fail:', e.message));
      }
    }
    for (const n of notices) {
      await sendMatchNotice(n.openid, { date: n.date, type: n.type });
    }
    return { matched, users };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await releaseBatchLock(conn, lockName);
    conn.release();
  }
}

module.exports = {
  runBatchMatch,
  applyAiRerank,
  batchLockName,
  harmonicMean,
  scorePair,
  scorePairDetail,
  scorePairEvidenceV2,
  passesQualityGate,
  calcAge,
  parseHeightCm,
  hardOk,
  eduRank,
  computeViewSimilarity,
  parseTags,
  extractLocalAppearanceTags,
  scoreAppearancePreference,
};
