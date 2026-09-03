const express = require('express');
const pool = require('../config/db');
const { success, fail } = require('../utils/response');
const { referralInput } = require('../../../miniprogram/cloudfunctions/api/lib/partnerReferralPolicy');
const {
  VIP_PRICE,
  VIP_DAYS,
  MATCH_COOLDOWN_DAYS,
  MATCH_DAYS,
  VIEW_TEXT_MIN,
  VIEW_TEXT_MAX,
} = require('../config/constants');
const safetyConfig = require('../config/safetyConfig');
const matchConfig = require('../config/matchConfig');

const router = express.Router();

/** GET /api/common/circles */
router.get('/circles', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, circle_name AS name, plate_name
       FROM occupation_circle WHERE status = 1 ORDER BY id ASC`
    );
    rows.push({ id: 0, name: '其他', plate_name: '其他' });
    return success(res, rows);
  } catch (err) {
    next(err);
  }
});

/** GET /api/common/promote-code */
router.get('/promote-code', async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) {
      return fail(res, '请填写推广码');
    }

    let referral;
    try {
      referral = referralInput(code);
    } catch (err) {
      return success(res, {
        valid: false,
        message: '推广码无效或合伙人未激活',
      });
    }
    const lookup = referral.partnerId ? 'p.id' : 'p.promote_code';
    const lookupValue = referral.partnerId || referral.code;

    const [rows] = await pool.query(
      `SELECT p.id AS partner_id, p.promote_code, p.circle_id,
              oc.circle_name, oc.plate_name
       FROM \`partner\` p
       LEFT JOIN occupation_circle oc ON oc.id = p.circle_id
       WHERE ${lookup} = ? AND p.status = 1
       LIMIT 1`,
      [lookupValue]
    );

    if (rows.length === 0) {
      return success(res, {
        valid: false,
        message: '推广码无效或合伙人未激活',
      });
    }

    const partner = rows[0];
    return success(res, {
      valid: true,
      partner_id: partner.partner_id,
      promote_code: partner.promote_code,
      circle_id: partner.circle_id,
      circle_name: partner.circle_name || '',
      plate_name: partner.plate_name || '',
      message: partner.circle_name
        ? `已识别 ${partner.circle_name} 合伙人推广码`
        : '已识别有效推广码',
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/common/stats */
router.get('/stats', async (req, res, next) => {
  try {
    const [[users]] = await pool.query('SELECT COUNT(*) AS c FROM `user` WHERE status = 1');
    const [[vip]] = await pool.query(
      `SELECT COUNT(*) AS c FROM \`user\`
       WHERE status = 1
         AND (free_member = 1 OR (is_vip = 1 AND vip_expire_time > NOW()))`
    );
    const [[matches]] = await pool.query('SELECT COUNT(*) AS c FROM user_match_log');
    const [[stat]] = await pool.query(
      'SELECT marry_success_count FROM system_stat ORDER BY id ASC LIMIT 1'
    );

    return success(res, {
      user_count: users.c,
      vip_count: vip.c,
      match_count: matches.c,
      married_count: stat?.marry_success_count || 0,
      marry_success_count: stat?.marry_success_count || 0,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/common/agreements */
router.get('/agreements', (req, res) => {
  return success(res, {
    user_service: {
      title: '用户服务协议',
      content:
        '欢迎使用 WeFinally 婚恋服务。您应如实填写个人信息，遵守平台规则，不得发布违法违规内容。平台提供 AI 智能匹配服务，匹配结果仅供参考。',
    },
    privacy: {
      title: '隐私政策',
      content:
        '我们重视您的隐私保护。您的个人信息仅用于婚恋匹配服务，未经同意不会向第三方披露。我们采取合理措施保护数据安全。',
    },
    data_auth: {
      title: '个人信息授权协议',
      content:
        '您授权平台在婚恋匹配范围内使用您提交的个人信息，包括基础资料与三观文本，用于算法匹配与合规留痕。',
    },
    config: {
      vip_price: VIP_PRICE,
      vip_days: VIP_DAYS,
      match_cooldown_days: MATCH_COOLDOWN_DAYS,
      match_days: MATCH_DAYS,
    },
  });
});

/** GET /api/common/safety-config */
router.get('/safety-config', (req, res) => {
  return success(res, {
    sosPhone: safetyConfig.sosPhone,
    guangdong110: {
      enabled: Boolean(safetyConfig.guangdong110?.enabled && safetyConfig.guangdong110?.appId),
      appId: safetyConfig.guangdong110?.appId || '',
      path: safetyConfig.guangdong110?.path || '',
    },
  });
});

/** GET /api/common/config — 小程序/后台只读业务配置 */
router.get('/config', (req, res) => {
  return success(res, {
    vip: {
      price: VIP_PRICE,
      days: VIP_DAYS,
    },
    match: {
      days: MATCH_DAYS,
      cooldownDays: MATCH_COOLDOWN_DAYS,
      useAppearanceInMatch: matchConfig.useAppearanceInMatch,
      weights: matchConfig.weights,
      qualityGate: matchConfig.qualityGate,
    },
    text: {
      viewTextMin: VIEW_TEXT_MIN,
      viewTextMax: VIEW_TEXT_MAX,
      meetNoteMaxLen: safetyConfig.meetNoteMaxLen,
    },
    safety: {
      meetSafetyEnabled: safetyConfig.meetSafetyEnabled,
      emergencyContactRequired: safetyConfig.emergencyContactRequired,
      sosPhone: safetyConfig.sosPhone,
      safetyTipsText: safetyConfig.safetyTipsText,
      guangdong110: {
        enabled: Boolean(safetyConfig.guangdong110?.enabled && safetyConfig.guangdong110?.appId),
        appId: safetyConfig.guangdong110?.appId || '',
        path: safetyConfig.guangdong110?.path || '',
      },
    },
  });
});

/** GET /api/common/health */
router.get('/health', (req, res) => {
  return success(res, { status: 'ok', time: new Date().toISOString() });
});

/** Platform aliases for miniprogram */
router.get('/marry-stat', async (req, res, next) => {
  try {
    const [[stat]] = await pool.query(
      'SELECT marry_success_count FROM system_stat ORDER BY id ASC LIMIT 1'
    );
    return success(res, {
      count: stat?.marry_success_count || 0,
      marry_success_count: stat?.marry_success_count || 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/rules', (req, res) => {
  return success(res, {
    title: 'WeFinally 平台规则',
    content: [
      '1. 禁止上传图片视频，无头像相册，从根源杜绝照骗',
      '2. 用户间无私聊、无社交、无动态，仅可联系平台 AI 客服',
      '3. AI 匹配每周三、周五 0:00 各 1 次，无手动刷新',
      '4. 择偶配置（含三观文本）7 天仅可修改 1 次',
      '5. 唯一套餐 188 元/30 天，无自动续费',
      '6. 违规永久封号不退费，黑名单禁止二次注册',
      '7. 结婚可自主报备注销；离异需管理员审核恢复',
      '8. 无线下活动、无社群，仅官方一对一私密奔现',
    ].join('\n'),
  });
});

module.exports = router;
