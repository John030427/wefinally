const express = require('express');
const axios = require('axios');
const pool = require('../config/db');
const { userAuth } = require('../middleware/auth');
const { signToken } = require('../middleware/auth');
const {
  requireActiveUser,
  blockDivorcedUser,
  isVipActive,
  isDivorced,
  debounceMiddleware,
  daysSince,
} = require('../middleware/guard');
const { success, fail } = require('../utils/response');
const { extractAppearanceTags } = require('../services/llmService');
const { normalizePsychProfile } = require('../utils/psychMatch');
const {
  AGREEMENT_TYPES,
  MATCH_COOLDOWN_DAYS,
  VIEW_TEXT_MIN,
  VIEW_TEXT_MAX,
  USER_STATUS,
  PARTNER_STATUS,
  ROLES,
  MARRY_REPORT_TYPE,
} = require('../config/constants');
const { referralInput } = require('../../../miniprogram/cloudfunctions/api/lib/partnerReferralPolicy');

const router = express.Router();

async function wxCode2Session(code) {
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) throw new Error('微信配置缺失');
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
  const { data } = await axios.get(url);
  if (data.errcode) throw new Error(data.errmsg || '微信登录失败');
  return data;
}

function parseGender(g) {
  if (g === 1 || g === 2) return g;
  if (g === '男') return 1;
  if (g === '女') return 2;
  return null;
}

function normalizeHeightRange(height) {
  if (!height) return '';
  const s = String(height);
  return s.includes('cm') ? s : `${s.replace(/[^\d]/g, '')}cm`;
}

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

function buildProfilePayload(user, settings) {
  const vip = isVipActive(user);
  return {
    ...user,
    is_vip: vip ? 1 : 0,
    isVip: vip,
    free_member: user.free_member || 0,
    free_source: user.free_source || '',
    vip_expire_time: user.vip_expire_time,
    circle_name: user.circle_name || null,
    match_settings: settings || null,
  };
}

async function resolveOpenid(source = {}) {
  const bodyOpenid = String(source.openid || '').trim();
  if (bodyOpenid) return bodyOpenid;
  const code = String(source.code || '').trim();
  if (!code) return '';
  return (await wxCode2Session(code)).openid;
}

function divorceReviewStatus(row) {
  if (!row) return 'not_submitted';
  if (Number(row.audit_status) === 1) return 'approved';
  if (Number(row.audit_status) === 2) return 'rejected';
  return 'pending';
}

function divorceReviewStatusText(status) {
  const map = {
    not_submitted: '未提交',
    pending: '审核中',
    approved: '审核通过',
    rejected: '审核驳回',
  };
  return map[status] || map.not_submitted;
}

function formatDivorceReview(row) {
  const status = divorceReviewStatus(row);
  if (!row) {
    return {
      status,
      audit_status: null,
      status_text: divorceReviewStatusText(status),
      message: '尚未提交离异复入申请',
    };
  }

  return {
    id: row.id,
    status,
    audit_status: row.audit_status,
    status_text: divorceReviewStatusText(status),
    message: status === 'approved'
      ? '申请已审核通过，请联系平台客服完成人工开通'
      : status === 'rejected'
        ? '申请被驳回，可修改信息后重新提交'
        : '申请已提交，请等待平台审核',
    openid: row.openid || '',
    contact_phone: row.contact_phone || '',
    review_note: row.review_note || '',
    reject_reason: row.reject_reason || '',
    create_time: row.create_time,
    update_time: row.update_time || row.create_time,
  };
}

function buildReviewNote(reviewNote, deviceInfo) {
  const note = String(reviewNote || '').trim();
  const device = String(deviceInfo || '').trim();
  const joined = device ? `${note}${note ? '\n' : ''}设备：${device}` : note;
  return joined.slice(0, 500);
}

/** POST /api/user/register */
router.post('/register', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      code,
      openid: bodyOpenid,
      gender,
      birth_year,
      height,
      height_range,
      education,
      city,
      circle_id,
      occupation_description,
      baby_plan,
      income,
      income_range,
      marriage_status,
      marry_status,
      house_car,
      appearance_description,
      appearance_want,
      promote_code,
      agreements,
      device_info,
    } = req.body;

    const openid = bodyOpenid || (code ? (await wxCode2Session(code)).openid : null);
    if (!openid) return fail(res, '缺少 openid 或 code');

    const [blocked] = await conn.query(
      'SELECT openid FROM openid_blacklist WHERE openid = ?',
      [openid]
    );
    if (blocked.length > 0) return fail(res, '账号已被限制注册', 403, 403);

    const [existing] = await conn.query('SELECT * FROM `user` WHERE openid = ?', [openid]);
    if (existing.length > 0) {
      if (isDivorced(existing[0])) {
        return fail(res, '离异用户无法自助注册恢复，请联系管理员', 403, 403);
      }
      return fail(res, '用户已注册');
    }

    const agreed = Array.isArray(agreements)
      ? agreements
      : AGREEMENT_TYPES;
    if (!AGREEMENT_TYPES.every((t) => agreed.includes(t))) {
      return fail(res, '请同意全部三项协议');
    }

    let referral;
    try {
      referral = referralInput(promote_code);
    } catch (err) {
      return fail(res, err.message);
    }
    if (!referral.code && !referral.partnerId) return fail(res, '邀请制注册需要有效邀请码');
    let promotePartnerId = 0;
    let lockedPromoteCode = '';
    const [partners] = referral.partnerId
      ? await conn.query('SELECT id, promote_code FROM `partner` WHERE id = ? AND status = ?', [referral.partnerId, PARTNER_STATUS.ACTIVE])
      : await conn.query('SELECT id, promote_code FROM `partner` WHERE promote_code = ? AND status = ?', [referral.code, PARTNER_STATUS.ACTIVE]);
    if (partners.length === 0) return fail(res, '邀请码无效或合伙人未激活');
    promotePartnerId = partners[0].id;
    lockedPromoteCode = partners[0].promote_code;

    const parsedGender = parseGender(gender);
    if (!parsedGender) return fail(res, '请选择性别');
    if (!birth_year) return fail(res, '请选择出生年份');

    const ms = marry_status || marriage_status || '未婚';
    if (ms === '离异') return fail(res, '离异用户无法自助注册', 403, 403);
    const normalizedCircleId = Number(circle_id || 0);
    const occupationDescription = String(occupation_description || '').trim().slice(0, 100);
    if (normalizedCircleId === 0 && !occupationDescription) return fail(res, '选择其他职业时请填写具体职业');

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO \`user\`
       (openid, gender, birth_year, height_range, education, circle_id, city,
        marry_status, baby_plan, income_range, house_car, status, member_status, member_status_updated_at,
        occupation_description,
        promote_partner_id, promote_code, appearance_description, appearance_want)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
      [
        openid,
        parsedGender,
        Number(String(birth_year).replace(/\D/g, '')),
        normalizeHeightRange(height_range || height),
        education || '',
        normalizedCircleId,
        city || '深圳',
        ms,
        baby_plan || '待定',
        income_range || income || '',
        house_car || '',
        USER_STATUS.NORMAL,
        'pending_profile',
        occupationDescription,
        promotePartnerId,
        lockedPromoteCode,
        appearance_description != null ? String(appearance_description).slice(0, 500) : null,
        appearance_want != null ? String(appearance_want).slice(0, 500) : null,
      ]
    );

    const userId = result.insertId;

    await conn.query(
      `INSERT INTO user_match_setting (user_id, last_edit_time) VALUES (?, NULL)`,
      [userId]
    );

    await conn.query(
      `INSERT INTO user_privacy_auth_log
       (openid, user_id, auth_service, auth_privacy, auth_data, device_info)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        openid,
        userId,
        agreed.includes('user_service') ? 1 : 0,
        agreed.includes('privacy') ? 1 : 0,
        agreed.includes('data_auth') ? 1 : 0,
        device_info || '',
      ]
    );

    if (promotePartnerId > 0) {
      await conn.query(
        'UPDATE `partner` SET total_promote_user = total_promote_user + 1 WHERE id = ?',
        [promotePartnerId]
      );
    }

    await conn.commit();

    const [users] = await pool.query('SELECT * FROM `user` WHERE id = ?', [userId]);
    const user = users[0];
    const token = signToken({ id: userId, role: ROLES.USER, openid });
    const profile = buildProfilePayload(user, null);
    return success(res, { token, user: profile, userInfo: profile }, '注册成功');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

/** GET /api/user/divorce-review/status — 注册前离异复入申请状态 */
router.get('/divorce-review/status', async (req, res, next) => {
  try {
    const openid = await resolveOpenid(req.query);
    if (!openid) return fail(res, '缺少 openid 或 code');

    const [rows] = await pool.query(
      `SELECT *
       FROM marry_report
       WHERE report_type = ? AND (
         openid = ?
         OR user_id IN (SELECT id FROM \`user\` WHERE openid = ?)
       )
       ORDER BY id DESC
       LIMIT 1`,
      [MARRY_REPORT_TYPE.DIVORCE, openid, openid]
    );

    return success(res, formatDivorceReview(rows[0] || null));
  } catch (err) {
    next(err);
  }
});

/** POST /api/user/divorce-review — 注册前离异复入申请 */
router.post('/divorce-review', async (req, res, next) => {
  try {
    const openid = await resolveOpenid(req.body);
    if (!openid) return fail(res, '缺少 openid 或 code');

    const contactPhone = String(req.body.contact_phone || req.body.phone || '').trim();
    if (!/^\d{11}$/.test(contactPhone)) return fail(res, '请输入正确的联系电话');

    const [blocked] = await pool.query(
      'SELECT openid FROM openid_blacklist WHERE openid = ?',
      [openid]
    );
    if (blocked.length > 0) return fail(res, '账号已被限制注册', 403, 403);

    const [latestRows] = await pool.query(
      `SELECT *
       FROM marry_report
       WHERE report_type = ? AND (
         openid = ?
         OR user_id IN (SELECT id FROM \`user\` WHERE openid = ?)
       )
       ORDER BY id DESC
       LIMIT 1`,
      [MARRY_REPORT_TYPE.DIVORCE, openid, openid]
    );
    const latest = latestRows[0];
    if (latest && Number(latest.audit_status) === 0) {
      return success(res, formatDivorceReview(latest), '已有待审核申请，请勿重复提交');
    }
    if (latest && Number(latest.audit_status) === 1) {
      return success(res, formatDivorceReview(latest), '申请已审核通过，请联系平台客服完成开通');
    }

    const [result] = await pool.query(
      `INSERT INTO marry_report
       (user_id, openid, report_type, proof_img, contact_phone, review_note, audit_status)
       VALUES (0, ?, ?, '', ?, ?, 0)`,
      [
        openid,
        MARRY_REPORT_TYPE.DIVORCE,
        contactPhone,
        buildReviewNote(req.body.review_note || req.body.remark, req.body.device_info),
      ]
    );
    const [rows] = await pool.query('SELECT * FROM marry_report WHERE id = ?', [result.insertId]);
    return success(res, formatDivorceReview(rows[0]), '离异复入申请已提交，请等待平台审核');
  } catch (err) {
    next(err);
  }
});

router.use(userAuth, requireActiveUser, blockDivorcedUser);

/** GET /api/user/profile */
router.get('/profile', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.*, oc.circle_name
       FROM \`user\` u
       LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
       WHERE u.id = ?`,
      [req.auth.id]
    );
    const user = rows[0];
    const [settings] = await pool.query(
      'SELECT * FROM user_match_setting WHERE user_id = ?',
      [req.auth.id]
    );
    return success(res, buildProfilePayload(user, settings[0] || null));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/user/profile — basic fields only, unlimited edits */
router.put(
  '/profile',
  debounceMiddleware((req) => `profile:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const {
        gender, birth_year, height_range, education, city, circle_id,
        marry_status, baby_plan, income_range, house_car,
        appearance_description, appearance_want,
      } = req.body;

      if (marry_status === '离异') {
        return fail(res, '无法自助修改为离异状态');
      }

      const parsedGender = gender != null ? parseGender(gender) : null;

      await pool.query(
        `UPDATE \`user\` SET
          gender = COALESCE(?, gender),
          birth_year = COALESCE(?, birth_year),
          height_range = COALESCE(?, height_range),
          education = COALESCE(?, education),
          city = COALESCE(?, city),
          circle_id = COALESCE(?, circle_id),
          baby_plan = COALESCE(?, baby_plan),
          income_range = COALESCE(?, income_range),
          house_car = COALESCE(?, house_car),
          appearance_description = COALESCE(?, appearance_description),
          appearance_want = COALESCE(?, appearance_want)
         WHERE id = ?`,
        [
          parsedGender,
          birth_year != null ? Number(String(birth_year).replace(/\D/g, '')) : null,
          height_range ? normalizeHeightRange(height_range) : null,
          education,
          city,
          circle_id,
          baby_plan,
          income_range,
          house_car,
          appearance_description != null ? String(appearance_description).slice(0, 500) : null,
          appearance_want != null ? String(appearance_want).slice(0, 500) : null,
          req.auth.id,
        ]
      );

      if (appearance_description != null) {
        const tags = await extractAppearanceTags(appearance_description);
        await pool.query('UPDATE `user` SET appearance_tags = ? WHERE id = ?', [JSON.stringify(tags || []), req.auth.id]);
      }
      if (appearance_want != null) {
        const wt = await extractAppearanceTags(appearance_want);
        await pool.query('UPDATE `user` SET appearance_want_tags = ? WHERE id = ?', [JSON.stringify(wt || []), req.auth.id]);
      }

      const [rows] = await pool.query(
        `SELECT u.*, oc.circle_name
         FROM \`user\` u
         LEFT JOIN occupation_circle oc ON oc.id = u.circle_id
         WHERE u.id = ?`,
        [req.auth.id]
      );
      return success(res, buildProfilePayload(rows[0], null), '更新成功');
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/user/match-settings */
router.get('/match-settings', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM user_match_setting WHERE user_id = ?',
      [req.auth.id]
    );
    const setting = rows[0] || null;
    const cooldownRemain = Math.max(
      0,
      MATCH_COOLDOWN_DAYS - daysSince(setting?.last_edit_time)
    );
    return success(res, {
      settings: setting,
      cooldown_days: MATCH_COOLDOWN_DAYS,
      can_update: cooldownRemain <= 0,
      cooldown_remain_days: Math.ceil(cooldownRemain),
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/user/match-settings — 7-day cooldown via last_edit_time */
router.put(
  '/match-settings',
  debounceMiddleware((req) => `match-settings:${req.auth.id}`),
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
        age_min, age_max, height_min, height_max,
        min_education, like_circle_ids, like_marry_status,
        like_baby_plan, like_income, like_house_car,
        self_view_text, target_view_text, psych_profile,
        prefer_age, prefer_education, prefer_height,
        my_values, expect_values,
      } = req.body;

      const ageRange = parseAgeRange(prefer_age);
      const heightRange = parseHeightRange(prefer_height);
      const selfText = String(self_view_text || my_values || '').trim();
      const targetText = String(target_view_text || expect_values || '').trim();

      const err1 = validateViewText(selfText, '自我描述');
      if (err1) return fail(res, err1);
      const err2 = validateViewText(targetText, '择偶期望');
      if (err2) return fail(res, err2);

      const payload = {
        age_min: age_min ?? ageRange.age_min,
        age_max: age_max ?? ageRange.age_max,
        height_min: height_min ?? heightRange.height_min,
        height_max: height_max ?? heightRange.height_max,
        min_education: min_education || prefer_education || null,
        like_circle_ids: like_circle_ids || '',
        like_marry_status: like_marry_status || null,
        like_baby_plan: like_baby_plan || null,
        like_income: like_income || null,
        like_house_car: like_house_car || null,
        self_view_text: selfText || null,
        target_view_text: targetText || null,
        psych_profile_json: JSON.stringify(normalizePsychProfile(psych_profile)),
      };

      if (current) {
        await pool.query(
          `UPDATE user_match_setting SET
            age_min = ?, age_max = ?, height_min = ?, height_max = ?,
            min_education = ?, like_circle_ids = ?, like_marry_status = ?,
            like_baby_plan = ?, like_income = ?, like_house_car = ?,
            self_view_text = ?, target_view_text = ?, psych_profile_json = ?, last_edit_time = NOW()
           WHERE user_id = ?`,
          [
            payload.age_min, payload.age_max, payload.height_min, payload.height_max,
            payload.min_education, payload.like_circle_ids, payload.like_marry_status,
            payload.like_baby_plan, payload.like_income, payload.like_house_car,
            payload.self_view_text, payload.target_view_text, payload.psych_profile_json,
            req.auth.id,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO user_match_setting
           (user_id, age_min, age_max, height_min, height_max, min_education,
            like_circle_ids, like_marry_status, like_baby_plan, like_income,
            like_house_car, self_view_text, target_view_text, psych_profile_json, last_edit_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            req.auth.id,
            payload.age_min, payload.age_max, payload.height_min, payload.height_max,
            payload.min_education, payload.like_circle_ids, payload.like_marry_status,
            payload.like_baby_plan, payload.like_income, payload.like_house_car,
            payload.self_view_text, payload.target_view_text, payload.psych_profile_json,
          ]
        );
      }

      await pool.query(
        'UPDATE `user` SET last_match_setting_time = NOW() WHERE id = ?',
        [req.auth.id]
      );

      const [updated] = await pool.query(
        'SELECT * FROM user_match_setting WHERE user_id = ?',
        [req.auth.id]
      );
      return success(res, updated[0], '匹配设置已更新');
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/user/marry-report — 结婚报备（待审核） */
router.post(
  '/marry-report',
  debounceMiddleware((req) => `marry-report:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const { remark } = req.body;
      const [pending] = await pool.query(
        'SELECT id FROM marry_report WHERE user_id = ? AND report_type = ? AND audit_status = 0',
        [req.auth.id, MARRY_REPORT_TYPE.MARRY]
      );
      if (pending.length > 0) {
        return fail(res, '已有待审核的结婚报备，请勿重复提交');
      }

      await pool.query(
        `INSERT INTO marry_report (user_id, report_type, proof_img, audit_status)
         VALUES (?, 1, ?, 0)`,
        [req.auth.id, (remark || '').slice(0, 255)]
      );
      return success(res, null, '结婚报备已提交，请等待平台审核');
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/user/cancel — 账号注销申请（待审核） */
router.post(
  '/cancel',
  debounceMiddleware((req) => `cancel:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const [pending] = await pool.query(
        'SELECT id FROM marry_report WHERE user_id = ? AND report_type = ? AND audit_status = 0',
        [req.auth.id, MARRY_REPORT_TYPE.CANCEL]
      );
      if (pending.length > 0) {
        return fail(res, '已有待审核申请，请等待处理');
      }

      await pool.query(
        `INSERT INTO marry_report (user_id, report_type, proof_img, audit_status)
         VALUES (?, ?, ?, 0)`,
        [req.auth.id, MARRY_REPORT_TYPE.CANCEL, '用户申请账号注销']
      );
      return success(res, null, '注销申请已提交，请等待平台审核');
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/user/claim-free — 登录用户输入激活码，命中白名单则开通会员 */
router.post(
  '/claim-free',
  debounceMiddleware((req) => `claim-free:${req.auth.id}`),
  async (req, res, next) => {
    let conn;
    try {
      const activationCode = String(req.body.activation_code || req.body.phone || '').trim();
      if (!/^\d{11}$/.test(activationCode)) return fail(res, '请输入正确的激活码');

      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT * FROM free_whitelist WHERE phone = ? LIMIT 1 FOR UPDATE',
        [activationCode]
      );
      if (rows.length === 0) {
        await conn.rollback();
        return fail(res, '激活码无效');
      }
      const wl = rows[0];
      if (Number(wl.used) === 1) {
        await conn.rollback();
        return fail(res, '激活码已使用');
      }

      await conn.query(
        'UPDATE `user` SET free_member = 1, free_source = ? WHERE id = ?',
        [wl.source, req.auth.id]
      );
      await conn.query('UPDATE free_whitelist SET used = 1 WHERE id = ?', [wl.id]);
      await conn.commit();
      return success(res, { free_source: wl.source }, '会员已激活');
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      next(err);
    } finally {
      if (conn) conn.release();
    }
  }
);

module.exports = router;
