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
const { normalizePsychProfile } = require('../utils/psychMatch');
const { runBatchMatch } = require('../services/matchService');

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
  const len = String(text || '').trim().length;
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
    prefer_city: '',
    like_marry_status: row.like_marry_status || '',
    like_baby_plan: row.like_baby_plan || '',
    prefer_height: row.height_min && row.height_max ? `${row.height_min}-${row.height_max}cm` : '',
    my_values: row.self_view_text || '',
    expect_values: row.target_view_text || '',
    psych_profile: normalizePsychProfile(row.psych_profile_json),
    ...row,
  };
}

function formatHandoffTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    match_log_id: row.match_log_id,
    user_id: row.user_id,
    match_user_id: row.match_user_id,
    status: row.status,
    status_text: handoffStatusText(row.status),
    service_note: row.service_note || '',
    create_time: row.create_time,
    update_time: row.update_time,
  };
}

function handoffStatusText(status) {
  return {
    submitted: '已提交',
    processing: '客服处理中',
    waiting_partner: '等待对方确认',
    arranged: '已安排',
    closed: '已关闭',
  }[status] || '已提交';
}

async function getHandoffTicket(matchLogId, userId) {
  const [rows] = await pool.query(
    'SELECT * FROM match_handoff_ticket WHERE match_log_id = ? AND user_id = ? LIMIT 1',
    [matchLogId, userId]
  ).catch(() => [[]]);
  return rows[0] || null;
}

function calcAge(birthYear) {
  if (!birthYear) return null;
  return new Date().getFullYear() - Number(birthYear);
}

function birthYearForAge(age) {
  return new Date().getFullYear() - Number(age || 30);
}

function rangeText(min, max, suffix, fallback) {
  if (min && max) return `${min}-${max}${suffix}`;
  return fallback;
}

function defaultPsychProfile() {
  return {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '亲密也独立',
    family_boundary: '小家庭优先',
    money_view: '共同规划',
    career_family: '动态平衡',
  };
}

function devCandidateOpenid(user) {
  if (String(user.openid || '').startsWith('sc_dev_match_seed_current')) {
    return 'sc_dev_match_seed_current_candidate';
  }
  return `dev_candidate_${user.id}`;
}

async function ensureDevCurrentUserCandidate(userId) {
  const [rows] = await pool.query(
    `SELECT u.*, ms.age_min, ms.age_max, ms.height_min, ms.height_max,
            ms.min_education, ms.like_baby_plan, ms.self_view_text,
            ms.target_view_text, ms.psych_profile_json
     FROM \`user\` u
     INNER JOIN user_match_setting ms ON ms.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;

  const targetGender = Number(user.gender) === 1 ? 2 : 1;
  const ageMin = Number(user.age_min) || 25;
  const ageMax = Number(user.age_max) || ageMin + 5;
  const targetAge = Math.round((ageMin + ageMax) / 2);
  const currentAge = calcAge(user.birth_year) || targetAge;
  const ownHeight = parseHeightRange(user.height_range);
  const candidateOpenid = devCandidateOpenid(user);
  const candidateBabyPlan = user.like_baby_plan && user.like_baby_plan !== '不限'
    ? user.like_baby_plan
    : (user.baby_plan || '待定');
  const psychJson = user.psych_profile_json || JSON.stringify(defaultPsychProfile());
  const vipExpire = new Date(Date.now() + 30 * 86400000);

  await pool.query(
    `INSERT INTO \`user\`
     (openid, gender, birth_year, height_range, education, circle_id, city,
      marry_status, baby_plan, status, is_vip, vip_expire_time,
      appearance_description, appearance_want)
     VALUES (?, ?, ?, ?, ?, ?, ?, '未婚', ?, ?, 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      gender = VALUES(gender),
      birth_year = VALUES(birth_year),
      height_range = VALUES(height_range),
      education = VALUES(education),
      circle_id = VALUES(circle_id),
      city = VALUES(city),
      marry_status = '未婚',
      baby_plan = VALUES(baby_plan),
      status = VALUES(status),
      is_vip = 1,
      vip_expire_time = VALUES(vip_expire_time),
      appearance_description = VALUES(appearance_description),
      appearance_want = VALUES(appearance_want)`,
    [
      candidateOpenid,
      targetGender,
      birthYearForAge(targetAge),
      rangeText(user.height_min, user.height_max, 'cm', '160-170cm'),
      user.min_education || user.education || '本科',
      user.circle_id || 1,
      user.city || '深圳',
      candidateBabyPlan,
      USER_STATUS.NORMAL,
      vipExpire,
      '开发测试候选：资料用于本地真机匹配自测',
      '希望对方真诚稳定，愿意认真沟通和经营关系',
    ]
  );
  const [[candidate]] = await pool.query('SELECT id FROM `user` WHERE openid = ?', [candidateOpenid]);
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, ?, ?, ?, ?, '高中及以下', '', '未婚', ?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
      age_min = VALUES(age_min),
      age_max = VALUES(age_max),
      height_min = VALUES(height_min),
      height_max = VALUES(height_max),
      min_education = VALUES(min_education),
      like_circle_ids = VALUES(like_circle_ids),
      like_marry_status = VALUES(like_marry_status),
      like_baby_plan = VALUES(like_baby_plan),
      self_view_text = VALUES(self_view_text),
      target_view_text = VALUES(target_view_text),
      psych_profile_json = VALUES(psych_profile_json),
      last_edit_time = NULL`,
    [
      candidate.id,
      Math.max(18, currentAge - 5),
      Math.min(65, currentAge + 5),
      ownHeight.height_min || 140,
      ownHeight.height_max || 220,
      user.baby_plan || null,
      user.target_view_text || '我重视稳定关系、真诚沟通和共同规划，也愿意认真了解后推进婚姻',
      user.self_view_text || '希望对方真诚稳定，沟通顺畅，愿意共同规划家庭和未来生活',
      psychJson,
    ]
  );
  return candidate;
}

function ageBand(birthYear) {
  if (!birthYear) return '';
  const age = new Date().getFullYear() - Number(birthYear);
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 5}岁`;
}

function parseJson(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (e) {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateOnly(value) {
  if (!value) return '';
  const source = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(source.getTime())) {
    return `${source.getFullYear()}-${pad2(source.getMonth() + 1)}-${pad2(source.getDate())}`;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : String(value);
}

function formatMatchItem(row, vip) {
  const matchDate = formatDateOnly(row.match_date);
  if (!vip) {
    return {
      id: row.id,
      matchId: row.id,
      status: 'matched',
      locked: true,
      match_date: matchDate,
      match_type: row.match_type,
      view_similarity: null,
      total_score: null,
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
    match_date: matchDate,
    match_type: row.match_type,
    gender: row.gender,
    birth_year: row.birth_year,
    city: row.city,
    view_similarity: row.view_similarity,
    compatibilityScore: row.view_similarity,
    total_score: Number(row.total_score || 0),
    totalScore: Number(row.total_score || 0),
    score_detail: parseJson(row.score_detail_json),
    ai_report_status: row.ai_report_status,
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
        prefer_age, prefer_education, prefer_height,
        like_marry_status, like_baby_plan, psych_profile,
        my_values, expect_values,
      } = req.body;
      const myValues = String(my_values || '').trim();
      const expectValues = String(expect_values || '').trim();

      const err1 = validateViewText(myValues, '我的三观自述');
      if (err1) return fail(res, err1);
      const err2 = validateViewText(expectValues, '期待对方三观');
      if (err2) return fail(res, err2);

      const ageRange = parseAgeRange(prefer_age);
      const heightRange = parseHeightRange(prefer_height);
      const psychProfileJson = JSON.stringify(normalizePsychProfile(psych_profile));

      if (current) {
        await pool.query(
          `UPDATE user_match_setting SET
            age_min = ?, age_max = ?, height_min = ?, height_max = ?,
            min_education = ?, like_circle_ids = ?,
            like_marry_status = ?, like_baby_plan = ?,
            self_view_text = ?, target_view_text = ?, psych_profile_json = ?, last_edit_time = NOW()
           WHERE user_id = ?`,
          [
            ageRange.age_min, ageRange.age_max,
            heightRange.height_min, heightRange.height_max,
            prefer_education || null, '',
            like_marry_status || null, like_baby_plan || null,
            myValues, expectValues, psychProfileJson,
            req.auth.id,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO user_match_setting
           (user_id, age_min, age_max, height_min, height_max, min_education,
            like_circle_ids, like_marry_status, like_baby_plan,
            self_view_text, target_view_text, psych_profile_json, last_edit_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            req.auth.id,
            ageRange.age_min, ageRange.age_max,
            heightRange.height_min, heightRange.height_max,
            prefer_education || null, '',
            like_marry_status || null, like_baby_plan || null,
            myValues, expectValues, psychProfileJson,
          ]
        );
      }

      await pool.query(
        'UPDATE `user` SET last_match_setting_time = NOW() WHERE id = ?',
        [req.auth.id]
      );

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

/** POST /api/match/start — dev-only manual trigger for real-device testing */
router.post('/start', requireVip, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.DEV_MATCH_START_ENABLED !== 'true') {
      return fail(res, '系统每周三、周五 0:00 自动匹配；开发测试需开启 DEV_MATCH_START_ENABLED=true');
    }
    const batchDate = String(req.body?.batch_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const scope = String(req.body?.scope_openid_prefix || '').trim();
    const allowRematch = req.body?.allow_rematch === true;
    const allowQualityFallback = req.body?.allow_quality_fallback === true;
    const resetUserBatch = req.body?.reset_user_batch === true;
    const devSeedCurrentUserCandidates = req.body?.dev_seed_current_user_candidates === true;
    if (devSeedCurrentUserCandidates) {
      await ensureDevCurrentUserCandidate(req.auth.id);
    }
    if (resetUserBatch) {
      await pool.query(
        `DELETE FROM user_match_log
         WHERE match_date = ? AND (user_id = ? OR match_user_id = ?)`,
        [batchDate, req.auth.id, req.auth.id]
      );
    }
    const options = {
      ...(scope ? { scopeOpenidPrefix: scope } : {}),
      ...(devSeedCurrentUserCandidates ? { onlyUserId: req.auth.id } : {}),
      ...(allowRematch ? { allowRematch: true } : {}),
      ...(allowQualityFallback ? { allowQualityFallback: true } : {}),
    };
    const result = await runBatchMatch(batchDate, '手动测试匹配', options);
    return success(res, { batch_date: batchDate, ...result }, '已触发手动测试匹配');
  } catch (err) {
    next(err);
  }
});

/** GET /api/match/latest — 最近一次匹配（首页用） */
router.get('/latest', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ml.id, ml.match_date, ml.match_type, ml.view_similarity, ml.total_score,
              ml.score_detail_json, ml.ai_report_status, ml.create_time,
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
      `SELECT ml.id, ml.match_date, ml.match_type, ml.view_similarity, ml.total_score,
              ml.score_detail_json, ml.ai_report_status, ml.create_time,
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

/** POST /api/match/handoff — official customer-service mediated match handoff */
router.post('/handoff', requireVip, async (req, res, next) => {
  try {
    const matchLogId = Number(req.body?.match_log_id || req.body?.matchLogId || req.body?.id);
    const matchUserId = Number(req.body?.match_user_id || req.body?.matchUserId || req.body?.matched_user_id || req.body?.matchedUserId);
    if (!matchLogId && !matchUserId) return fail(res, '缺少匹配ID');

    let match = null;
    if (matchLogId) {
      const [rows] = await pool.query(
        'SELECT id, user_id, match_user_id FROM user_match_log WHERE id = ? AND user_id = ? LIMIT 1',
        [matchLogId, req.auth.id]
      );
      match = rows[0] || null;
    }
    if (!match && matchUserId) {
      const [fallbackRows] = await pool.query(
        `SELECT id, user_id, match_user_id
         FROM user_match_log
         WHERE user_id = ? AND match_user_id = ?
         ORDER BY match_date DESC, id DESC
         LIMIT 1`,
        [req.auth.id, matchUserId]
      );
      match = fallbackRows[0] || null;
    }
    if (!match) return fail(res, '匹配记录不存在，请返回匹配记录页重新进入', 404, 404);

    const existing = await getHandoffTicket(match.id, req.auth.id);
    if (existing) return success(res, formatHandoffTicket(existing), '已提交官方对接申请');

    const [created] = await pool.query(
      `INSERT INTO match_handoff_ticket
       (match_log_id, user_id, match_user_id, status)
       VALUES (?, ?, ?, 'submitted')`,
      [match.id, req.auth.id, match.match_user_id]
    );
    await pool.query(
      `INSERT INTO ai_chat_log (user_id, user_content, ai_content, is_manual_transfer)
       VALUES (?, ?, ?, 1)`,
      [
        req.auth.id,
        `申请官方奔现对接：匹配记录#${match.id}`,
        '已收到你的官方奔现对接申请，平台客服会先核对双方意向，再推进下一步。',
      ]
    ).catch(() => {});
    const [tickets] = await pool.query('SELECT * FROM match_handoff_ticket WHERE id = ?', [created.insertId]);
    return success(res, formatHandoffTicket(tickets[0]), '已提交官方对接申请');
  } catch (err) {
    next(err);
  }
});

async function loadMatchDetail(req, res, next, matchId) {
  try {
    const [rows] = await pool.query(
      `SELECT ml.*, u.gender, u.birth_year, u.height_range, u.education,
              u.city, u.circle_id, u.baby_plan, oc.circle_name
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
    const matchDate = formatDateOnly(match.match_date);

    if (!vip) {
      return success(res, {
        id: match.id,
        matchId: match.id,
        match_date: matchDate,
        match_type: match.match_type,
        locked: true,
        view_similarity: null,
        total_score: null,
        message: '你有一位匹配对象，开通 VIP 查看完整匹配详情',
      });
    }

    return success(res, {
      id: match.id,
      matchId: match.id,
      match_date: matchDate,
      match_type: match.match_type,
      locked: false,
      view_similarity: match.view_similarity,
      compatibilityScore: match.view_similarity,
      total_score: Number(match.total_score || 0),
      totalScore: Number(match.total_score || 0),
      score_detail: parseJson(match.score_detail_json),
      ai_report_text: match.ai_report_text || '',
      ai_report_status: match.ai_report_status,
      ai_report_error: match.ai_report_error || '',
      handoff_ticket: formatHandoffTicket(await getHandoffTicket(match.id, req.auth.id)),
      match_user_id: match.match_user_id,
      matched_user_id: match.match_user_id,
      gender: match.gender,
      birth_year: match.birth_year,
      city: match.city,
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
