const express = require('express');
const pool = require('../config/db');
const { userAuth } = require('../middleware/auth');
const {
  requireActiveUser,
  requireVip,
  debounceMiddleware,
  daysSince,
  isVipActive,
  loadUser,
} = require('../middleware/guard');
const { success, fail, paginate } = require('../utils/response');
const {
  MATCH_COOLDOWN_DAYS,
  VIEW_TEXT_MIN,
  VIEW_TEXT_MAX,
  USER_STATUS,
} = require('../config/constants');

const router = express.Router();

function parseAgeRange(preferAge) {
  if (!preferAge) return { age_min: null, age_max: null };
  const m = String(preferAge).match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { age_min: Number(m[1]), age_max: Number(m[2]) };
  const above = String(preferAge).match(/(\d+)/);
  if (above) return { age_min: Number(above[1]), age_max: 99 };
  return { age_min: null, age_max: null };
}

function parseHeightRange(preferHeight) {
  if (!preferHeight) return { height_min: null, height_max: null };
  const m = String(preferHeight).match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { height_min: Number(m[1]), height_max: Number(m[2]) };
  const above = String(preferHeight).match(/(\d+)/);
  if (above) return { height_min: Number(above[1]), height_max: 220 };
  return { height_min: null, height_max: null };
}

function validateViewText(text, label) {
  if (!text) return null;
  const len = text.trim().length;
  if (len < VIEW_TEXT_MIN || len > VIEW_TEXT_MAX) {
    return `${label}长度需在 ${VIEW_TEXT_MIN}-${VIEW_TEXT_MAX} 字之间`;
  }
  return null;
}

function formatSetting(row) {
  if (!row) return null;
  return {
    prefer_age: row.age_min && row.age_max ? `${row.age_min}-${row.age_max}岁` : '',
    prefer_education: row.min_education || '',
    prefer_city: row.like_circle_ids || '',
    like_marry_status: row.like_marry_status || '',
    like_baby_plan: row.like_baby_plan || '',
    prefer_height: row.height_min && row.height_max ? `${row.height_min}-${row.height_max}cm` : '',
    my_values: row.self_view_text || '',
    expect_values: row.target_view_text || '',
    ...row,
  };
}

function ageBand(birthYear) {
  if (!birthYear) return '';
  const age = new Date().getFullYear() - Number(birthYear);
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 5}岁`;
}

function formatMatchItem(row, vip) {
  if (!vip) {
    return {
      id: row.id,
      matchId: row.id,
      status: 'matched',
      locked: true,
      match_date: row.match_date,
      match_type: row.match_type,
      view_similarity: null,
      message: '你有一位匹配对象，开通 VIP 查看完整匹配详情',
    };
  }

  return {
    id: row.id,
    matchId: row.id,
    status: 'matched',
    locked: false,
    matchTime: row.create_time,
    createdAt: row.create_time,
    match_date: row.match_date,
    match_type: row.match_type,
    view_similarity: row.view_similarity,
    compatibilityScore: row.view_similarity,
    matched_user_id: row.match_user_id,
    age_band: ageBand(row.birth_year),
    height_range: row.height_range,
    education: row.education,
    baby_plan: row.baby_plan,
    circle_name: row.circle_name,
  };
}

router.use(userAuth, requireActiveUser);

/** GET /api/match/setting/cooldown — 非 VIP 也可查看/设置择偶（匹配本身需 VIP） */
router.get('/setting/cooldown', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT last_edit_time FROM user_match_setting WHERE user_id = ?',
      [req.auth.id]
    );
    const lastEdit = rows[0]?.last_edit_time;
    const cooldownRemain = Math.max(0, MATCH_COOLDOWN_DAYS - daysSince(lastEdit));
    const cooldownEndTime = lastEdit
      ? new Date(new Date(lastEdit).getTime() + MATCH_COOLDOWN_DAYS * 86400000).toISOString()
      : null;

    return success(res, {
      cooldown_remain_days: Math.ceil(cooldownRemain),
      can_update: cooldownRemain <= 0,
      cooldownEndTime,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/match/setting */
router.get('/setting', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM user_match_setting WHERE user_id = ?',
      [req.auth.id]
    );
    return success(res, formatSetting(rows[0]));
  } catch (err) {
    next(err);
  }
});

/** POST /api/match/setting */
router.post(
  '/setting',
  debounceMiddleware((req) => `match-setting:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const [settingsRows] = await pool.query(
        'SELECT * FROM user_match_setting WHERE user_id = ?',
        [req.auth.id]
      );
      const current = settingsRows[0];

      if (current && daysSince(current.last_edit_time) < MATCH_COOLDOWN_DAYS) {
        const remain = Math.ceil(MATCH_COOLDOWN_DAYS - daysSince(current.last_edit_time));
        return fail(res, `匹配设置冷却中，还需 ${remain} 天方可修改`);
      }

      const {
        prefer_age, prefer_education, prefer_city, prefer_height,
        like_marry_status, like_baby_plan,
        my_values, expect_values,
      } = req.body;

      const err1 = validateViewText(my_values, '我的三观自述');
      if (err1) return fail(res, err1);
      const err2 = validateViewText(expect_values, '期待对方三观');
      if (err2) return fail(res, err2);

      const ageRange = parseAgeRange(prefer_age);
      const heightRange = parseHeightRange(prefer_height);

      if (current) {
        await pool.query(
          `UPDATE user_match_setting SET
            age_min = ?, age_max = ?, height_min = ?, height_max = ?,
            min_education = ?, like_circle_ids = ?,
            like_marry_status = ?, like_baby_plan = ?,
            self_view_text = ?, target_view_text = ?, last_edit_time = NOW()
           WHERE user_id = ?`,
          [
            ageRange.age_min, ageRange.age_max,
            heightRange.height_min, heightRange.height_max,
            prefer_education || null, prefer_city || '',
            like_marry_status || null, like_baby_plan || null,
            my_values.trim(), expect_values.trim(),
            req.auth.id,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO user_match_setting
           (user_id, age_min, age_max, height_min, height_max, min_education,
            like_circle_ids, like_marry_status, like_baby_plan,
            self_view_text, target_view_text, last_edit_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            req.auth.id,
            ageRange.age_min, ageRange.age_max,
            heightRange.height_min, heightRange.height_max,
            prefer_education || null, prefer_city || '',
            like_marry_status || null, like_baby_plan || null,
            my_values.trim(), expect_values.trim(),
          ]
        );
      }

      await pool.query(
        'UPDATE `user` SET last_match_setting_time = NOW() WHERE id = ?',
        [req.auth.id]
      );

      const [users] = await pool.query('SELECT status FROM `user` WHERE id = ?', [req.auth.id]);
      if (users[0].status === USER_STATUS.PENDING) {
        await pool.query('UPDATE `user` SET status = ? WHERE id = ?', [USER_STATUS.NORMAL, req.auth.id]);
      }

      const [updatedRows] = await pool.query(
        'SELECT * FROM user_match_setting WHERE user_id = ?',
        [req.auth.id]
      );
      const cooldownEndTime = new Date(Date.now() + MATCH_COOLDOWN_DAYS * 86400000).toISOString();

      return success(res, {
        ...formatSetting(updatedRows[0]),
        cooldown_remain_days: MATCH_COOLDOWN_DAYS,
        cooldownEndTime,
      }, '保存成功');
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/match/start — matching is cron-only (Wed/Fri) */
router.post('/start', requireVip, async (req, res) => {
  return fail(res, '系统每周三、周五 0:00 自动匹配，无需手动发起');
});

/** GET /api/match/latest — 最近一次匹配（首页用） */
router.get('/latest', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ml.id, ml.match_date, ml.match_type, ml.view_similarity, ml.create_time,
              ml.match_user_id, u.gender, u.birth_year, u.height_range,
              u.education, u.city, u.baby_plan, oc.circle_name
       FROM user_match_log ml
       JOIN \`user\` u ON u.id = ml.match_user_id
       LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
       WHERE ml.user_id = ?
       ORDER BY ml.match_date DESC, ml.id DESC
       LIMIT 1`,
      [req.auth.id]
    );
    const me = req.user || (await loadUser(req.auth.id));
    const vip = isVipActive(me);
    if (rows.length === 0) return success(res, null);
    return success(res, formatMatchItem(rows[0], vip));
  } catch (err) {
    next(err);
  }
});

/** GET /api/match/list */
router.get('/list', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Number(req.query.pageSize) || 10);
    const offset = (page - 1) * pageSize;

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM user_match_log WHERE user_id = ?',
      [req.auth.id]
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT ml.id, ml.match_date, ml.match_type, ml.view_similarity, ml.create_time,
              ml.match_user_id, u.gender, u.birth_year, u.height_range,
              u.education, u.city, u.baby_plan, oc.circle_name
       FROM user_match_log ml
       JOIN \`user\` u ON u.id = ml.match_user_id
       LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
       WHERE ml.user_id = ?
       ORDER BY ml.match_date DESC, ml.view_similarity DESC
       LIMIT ? OFFSET ?`,
      [req.auth.id, pageSize, offset]
    );

    const me = req.user || (await loadUser(req.auth.id));
    const vip = isVipActive(me);
    const list = rows.map((r) => formatMatchItem(r, vip));
    return success(res, paginate(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

/** GET /api/match/detail */
router.get('/detail', async (req, res, next) => {
  try {
    const matchId = Number(req.query.id);
    if (!matchId) return fail(res, '缺少匹配ID');
    return loadMatchDetail(req, res, next, matchId);
  } catch (err) {
    next(err);
  }
});

async function loadMatchDetail(req, res, next, matchId) {
  try {
    const [rows] = await pool.query(
      `SELECT ml.*, u.birth_year, u.height_range, u.education,
              u.circle_id, u.baby_plan, oc.circle_name
       FROM user_match_log ml
       JOIN \`user\` u ON u.id = ml.match_user_id
       LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
       WHERE ml.id = ? AND ml.user_id = ?`,
      [matchId, req.auth.id]
    );

    if (rows.length === 0) return fail(res, '匹配记录不存在', 404, 404);

    const match = rows[0];
    const me = req.user || (await loadUser(req.auth.id));
    const vip = isVipActive(me);

    if (!vip) {
      return success(res, {
        id: match.id,
        matchId: match.id,
        match_date: match.match_date,
        match_type: match.match_type,
        locked: true,
        view_similarity: null,
        message: '你有一位匹配对象，开通 VIP 查看完整匹配详情',
      });
    }

    return success(res, {
      id: match.id,
      matchId: match.id,
      match_date: match.match_date,
      match_type: match.match_type,
      locked: false,
      view_similarity: match.view_similarity,
      compatibilityScore: match.view_similarity,
      age_band: ageBand(match.birth_year),
      height_range: match.height_range,
      education: match.education,
      circle_name: match.circle_name,
      baby_plan: match.baby_plan,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/match/:id — legacy alias */
router.get('/:id', async (req, res, next) => {
  const matchId = Number(req.params.id);
  if (!matchId) return fail(res, '无效ID');
  return loadMatchDetail(req, res, next, matchId);
});

module.exports = router;
