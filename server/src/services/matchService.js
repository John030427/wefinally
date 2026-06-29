const pool = require('../config/db');
const { computeViewSimilarity } = require('../utils/viewSimilarity');
const { USER_STATUS } = require('../config/constants');

function calcAge(birthYear) {
  if (!birthYear) return null;
  return new Date().getFullYear() - Number(birthYear);
}

function parseHeightCm(heightRange) {
  if (!heightRange) return null;
  const m = String(heightRange).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function circleMatches(likeCircleIds, circleId) {
  if (!likeCircleIds) return true;
  const ids = String(likeCircleIds).split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return true;
  return ids.includes(String(circleId));
}

/**
 * Score weights: baby_plan > view_similarity > age/height > education > circle > city
 */
function scorePair(user, settings, candidate, viewSim) {
  let score = 0;

  const likeBaby = settings.like_baby_plan;
  if (likeBaby && candidate.baby_plan === likeBaby) score += 30;
  else if (!likeBaby) score += 10;

  score += (viewSim / 100) * 25;

  const cAge = calcAge(candidate.birth_year);
  if (cAge != null && settings.age_min != null && settings.age_max != null) {
    if (cAge >= settings.age_min && cAge <= settings.age_max) score += 15;
    else {
      const dist = Math.min(Math.abs(cAge - settings.age_min), Math.abs(cAge - settings.age_max));
      score += Math.max(0, 15 - dist * 2);
    }
  } else {
    score += 5;
  }

  const cHeight = parseHeightCm(candidate.height_range);
  if (cHeight && settings.height_min && settings.height_max) {
    if (cHeight >= settings.height_min && cHeight <= settings.height_max) score += 12;
    else {
      const dist = Math.min(
        Math.abs(cHeight - settings.height_min),
        Math.abs(cHeight - settings.height_max)
      );
      score += Math.max(0, 12 - dist);
    }
  } else {
    score += 3;
  }

  if (settings.min_education && candidate.education === settings.min_education) score += 8;
  else if (!settings.min_education) score += 2;

  if (circleMatches(settings.like_circle_ids, candidate.circle_id)) score += 6;
  else score += 2;

  if (user.city && candidate.city === user.city) score += 4;
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

    for (const user of vipUsers) {
      const [already] = await conn.query(
        'SELECT id FROM user_match_log WHERE user_id = ? AND match_date = ? LIMIT 1',
        [user.id, batchDate]
      );
      if (already.length > 0) continue;

      const settings = {
        age_min: user.age_min,
        age_max: user.age_max,
        height_min: user.height_min,
        height_max: user.height_max,
        min_education: user.min_education,
        like_circle_ids: user.like_circle_ids,
        like_marry_status: user.like_marry_status,
        like_baby_plan: user.like_baby_plan,
        like_income: user.like_income,
        like_house_car: user.like_house_car,
      };

      const candidates = await getCandidates(conn, user);
      if (candidates.length === 0) continue;

      users += 1;
      const scored = candidates.map((c) => {
        const viewSim = computeViewSimilarity(
          user.self_view_text,
          user.target_view_text,
          c.self_view_text,
          c.target_view_text
        );
        return {
          candidate: c,
          viewSim,
          score: scorePair(user, settings, c, viewSim),
        };
      });

      scored.sort((a, b) => b.score - a.score || b.viewSim - a.viewSim);
      const best = scored[0];
      if (!best) continue;

      const [dup] = await conn.query(
        `SELECT id FROM user_match_log
         WHERE match_date = ? AND user_id = ? AND match_user_id = ?`,
        [batchDate, user.id, best.candidate.id]
      );
      if (dup.length > 0) continue;

      await conn.query(
        `INSERT INTO user_match_log
         (user_id, match_user_id, view_similarity, match_date, match_type)
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, best.candidate.id, best.viewSim, batchDate, matchType]
      );
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
  computeViewSimilarity,
};
