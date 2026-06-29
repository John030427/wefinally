const pool = require('../config/db');
const { computeViewSimilarity } = require('../utils/viewSimilarity');
const { USER_STATUS } = require('../config/constants');
const cfg = require('../config/matchConfig');

const COMBINE = (ab, ba) => (ab + ba) / 2;

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

/**
 * Score weights: baby_plan > view_similarity > age/height > education > circle > city
 * 满分权重读 matchConfig.weights；else 分支的基础分为兜底，保持原值（ponytail: 主权重可调即可）。
 */
function scorePair(user, settings, candidate, viewSim) {
  const W = cfg.weights;
  let score = 0;

  const likeBaby = settings.like_baby_plan;
  if (likeBaby && candidate.baby_plan === likeBaby) score += W.baby;
  else if (!likeBaby) score += 10;

  score += (viewSim / 100) * W.view;

  const cAge = calcAge(candidate.birth_year);
  if (cAge != null && settings.age_min != null && settings.age_max != null) {
    if (cAge >= settings.age_min && cAge <= settings.age_max) score += W.age;
    else {
      const dist = Math.min(Math.abs(cAge - settings.age_min), Math.abs(cAge - settings.age_max));
      score += Math.max(0, W.age - dist * 2);
    }
  } else {
    score += 5;
  }

  const cHeight = parseHeightCm(candidate.height_range);
  if (cHeight && settings.height_min && settings.height_max) {
    if (cHeight >= settings.height_min && cHeight <= settings.height_max) score += W.height;
    else {
      const dist = Math.min(
        Math.abs(cHeight - settings.height_min),
        Math.abs(cHeight - settings.height_max)
      );
      score += Math.max(0, W.height - dist);
    }
  } else {
    score += 3;
  }

  // 学历：层级比较——达到或高于要求给满分（不再要求完全相等）
  if (settings.min_education) {
    score += eduRank(candidate.education) >= eduRank(settings.min_education) ? W.education : 0;
  } else {
    score += 2;
  }

  if (circleMatches(settings.like_circle_ids, candidate.circle_id)) score += W.circle;
  else score += 2;

  if (user.city && candidate.city === user.city) score += W.city;
  else score += 1;

  return Math.round(score * 100) / 100;
}

async function getActiveVipUsers(conn) {
  const [rows] = await conn.query(
    `SELECT u.*, ms.age_min, ms.age_max, ms.height_min, ms.height_max,
            ms.min_education, ms.like_circle_ids, ms.like_marry_status,
            ms.like_baby_plan, ms.like_income, ms.like_house_car,
            ms.self_view_text, ms.target_view_text
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.status = ?
       AND u.is_vip = 1
       AND u.vip_expire_time > NOW()
       AND u.marry_status != '离异'`,
    [USER_STATUS.NORMAL]
  );
  return rows;
}

async function getCandidates(conn, user) {
  const targetGender = user.gender === 1 ? 2 : 1;
  const [rows] = await conn.query(
    `SELECT u.*, ms.age_min, ms.age_max, ms.height_min, ms.height_max,
            ms.min_education, ms.like_circle_ids, ms.like_marry_status,
            ms.like_baby_plan, ms.like_income, ms.like_house_car,
            ms.self_view_text, ms.target_view_text
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.id != ?
       AND u.status = ?
       AND u.gender = ?
       AND u.marry_status != '离异'`,
    [user.id, USER_STATUS.NORMAL, targetGender]
  );
  return rows;
}

/**
 * Run matching for all active VIP users for a batch date.
 * Each user receives at most 1 match per batch.
 */
async function runBatchMatch(batchDate, matchType) {
  const conn = await pool.getConnection();
  let matched = 0;
  let users = 0;

  try {
    await conn.beginTransaction();
    const vipUsers = await getActiveVipUsers(conn);
    const usedThisBatch = new Set();

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
      const candidates = await getCandidates(conn, user);
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

        const viewSim = computeViewSimilarity(
          user.self_view_text,
          user.target_view_text,
          c.self_view_text,
          c.target_view_text
        );
        const scoreAB = scorePair(user, settingsA, c, viewSim);
        const scoreBA = scorePair(c, settingsOf(c), user, viewSim);
        if (Math.min(scoreAB, scoreBA) < cfg.minSideScore) continue;

        scored.push({ candidate: c, viewSim, combined: COMBINE(scoreAB, scoreBA) });
      }

      scored.sort((a, b) => b.combined - a.combined || b.viewSim - a.viewSim);
      const best = scored[0];
      if (!best) continue;

      await conn.query(
        `INSERT INTO user_match_log
         (user_id, match_user_id, view_similarity, match_date, match_type)
         VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        [
          user.id, best.candidate.id, best.viewSim, batchDate, matchType,
          best.candidate.id, user.id, best.viewSim, batchDate, matchType,
        ]
      );
      usedThisBatch.add(user.id);
      usedThisBatch.add(best.candidate.id);
      matched += 1;
    }

    await conn.commit();
    return { matched, users };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  runBatchMatch,
  scorePair,
  calcAge,
  parseHeightCm,
  hardOk,
  eduRank,
  computeViewSimilarity,
};
