const OFFICIAL_SUPPORT_CODE = /^WF-\d{6}$/
const TEST_OPENID = /^(dev|test|fixture|mock)[_-]/i

function numericUserId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function isTestUser(user = {}) {
  user = user || {}
  if (Number(user.is_test_fixture || 0) === 1) return true
  if (numericUserId(user.ab_test_owner_user_id)) return true
  return TEST_OPENID.test(String(user.openid || '').trim())
}

function testSupportCode(user) {
  const id = numericUserId(user && user.id)
  if (!id) throw new Error('测试用户ID无效')
  return `TEST-${String(id).padStart(6, '0')}`
}

function supportCodeFor(user = {}) {
  if (isTestUser(user)) return testSupportCode(user)
  const code = String(user.support_code || '').trim().toUpperCase()
  if (!code) return ''
  if (!OFFICIAL_SUPPORT_CODE.test(code)) throw new Error('用户编号格式无效')
  return code
}

function genderText(value) {
  if (Number(value) === 1) return '男'
  if (Number(value) === 2) return '女'
  return ''
}

function userLabel(user = {}) {
  const code = supportCodeFor(user) || 'WF-待分配'
  const gender = genderText(user.gender)
  const city = String(user.city || '').trim()
  const details = [gender, city].filter(Boolean)
  return details.length ? `${code} · ${details.join(' · ')}` : `${code} · 资料未完善`
}

function projectUserIdentity(user = {}, options = {}) {
  const projected = {
    support_code: supportCodeFor(user),
    display_label: userLabel(user),
    gender: Number(user.gender || 0),
    gender_text: genderText(user.gender),
    city: String(user.city || '').trim(),
    is_test: isTestUser(user)
  }
  if (options.includeSensitive === true) {
    projected.id = numericUserId(user.id)
    projected.openid = String(user.openid || '')
    projected.phone = String(user.phone || '')
  }
  return projected
}

module.exports = {
  OFFICIAL_SUPPORT_CODE,
  genderText,
  isTestUser,
  projectUserIdentity,
  supportCodeFor,
  testSupportCode,
  userLabel
}
