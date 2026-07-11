const express = require('express')
const pool = require('../config/db')
const { userAuth } = require('../middleware/auth')
const { requireActiveUser } = require('../middleware/guard')
const { success, fail } = require('../utils/response')
const {
  REAPPLY_COOLDOWN_DAYS,
  memberStatus,
  canSubmitApplication
} = require('../utils/memberPolicy')

const router = express.Router()
router.use(userAuth, requireActiveUser)

function missingFields(user, setting) {
  const missing = []
  const fields = [
    [user.gender, '性别'], [user.birth_year, '出生年份'], [user.height_range, '身高'],
    [user.education, '学历'], [user.city, '工作城市'], [user.marry_status, '婚姻状况'],
    [user.baby_plan, '婚育计划'], [setting.age_min && setting.age_max, '期待年龄'],
    [setting.height_min && setting.height_max, '期待身高'], [setting.min_education, '期待学历'],
    [setting.like_marry_status, '期待婚姻状况'], [setting.like_baby_plan, '期待婚育计划'],
    [setting.self_view_text, '我的三观自述'], [setting.target_view_text, '期待对方三观']
  ]
  fields.forEach(([value, label]) => { if (!value) missing.push(label) })
  if (Number(user.circle_id || 0) === 0 && !String(user.occupation_description || '').trim()) missing.push('职业描述')
  return missing
}

router.get('/application', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM member_application WHERE user_id = ? ORDER BY revision DESC LIMIT 1',
      [req.auth.id]
    )
    const eligibility = canSubmitApplication(req.user)
    return success(res, {
      member_status: memberStatus(req.user),
      member_status_updated_at: req.user.member_status_updated_at,
      can_submit: eligibility.allowed,
      reapply_remaining_days: eligibility.remainingDays,
      reapply_cooldown_days: REAPPLY_COOLDOWN_DAYS,
      review_note: rows[0]?.review_note || '',
      application: rows[0] || null
    })
  } catch (err) {
    next(err)
  }
})

router.post('/application/submit', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const eligibility = canSubmitApplication(req.user)
    if (!eligibility.allowed) {
      return fail(res, eligibility.remainingDays > 0
        ? `审核拒绝后需等待${eligibility.remainingDays}天才能重新申请`
        : '当前状态不能提交会员申请')
    }
    const [partners] = await conn.query(
      'SELECT id, status FROM partner WHERE id = ? AND status = 1',
      [req.user.promote_partner_id]
    )
    if (!partners.length) return fail(res, '邀请合伙人当前不可用，请联系平台客服')
    const [settings] = await conn.query('SELECT * FROM user_match_setting WHERE user_id = ?', [req.auth.id])
    const setting = settings[0] || {}
    const missing = missingFields(req.user, setting)
    if (missing.length) return fail(res, `请先补充：${missing.join('、')}`)

    await conn.beginTransaction()
    const [latestRows] = await conn.query(
      'SELECT revision FROM member_application WHERE user_id = ? ORDER BY revision DESC LIMIT 1 FOR UPDATE',
      [req.auth.id]
    )
    const revision = Number(latestRows[0]?.revision || 0) + 1
    const [result] = await conn.query(
      `INSERT INTO member_application
       (user_id, inviter_partner_id, assigned_partner_id, revision, status, profile_snapshot_json)
       VALUES (?, ?, ?, ?, 'pending_review', ?)`,
      [req.auth.id, req.user.promote_partner_id, req.user.promote_partner_id, revision, JSON.stringify({ profile: req.user, match_setting: setting })]
    )
    await conn.query(
      `UPDATE user SET member_status = 'pending_review', member_status_updated_at = NOW() WHERE id = ?`,
      [req.auth.id]
    )
    await conn.commit()
    const [rows] = await pool.query('SELECT * FROM member_application WHERE id = ?', [result.insertId])
    return success(res, rows[0], '会员申请已提交')
  } catch (err) {
    await conn.rollback()
    next(err)
  } finally {
    conn.release()
  }
})

module.exports = router
