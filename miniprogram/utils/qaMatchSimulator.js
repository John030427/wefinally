const { get, post } = require('./request')
const { API_PATHS, STORAGE_KEYS } = require('./constants')

const QA_SCENARIOS = [
  { value: 'coordinate', label: 'AI协调' },
  { value: 'accept_direct', label: '直接接受' },
  { value: 'decline', label: '暂不方便' },
  { value: 'no_response', label: '不回应' },
  { value: 'accept_no_prefs', label: '接受未填偏好' },
  { value: 'manual_step', label: '手动推进' }
]

function buildRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function qaEnabledFromProfile(profile) {
  return !!(profile && (profile.qa_test_run_enabled === true || profile.qa_test_run_enabled === 1))
}

function registrationReplayEnabledFromProfile(profile) {
  return !!(profile && (
    profile.qa_registration_replay_enabled === true
    || profile.qa_registration_replay_enabled === 1
  ))
}

async function refreshQaAccess(options = {}) {
  const app = getApp()
  const force = options.force === true
  let profile = app.globalData.userInfo
  if (force || !profile || profile.qa_test_run_enabled === undefined) {
    try {
      profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      if (profile) {
        app.globalData.userInfo = profile
        wx.setStorageSync(STORAGE_KEYS.USER_INFO, profile)
      }
    } catch (err) {
      profile = profile || null
    }
  }
  return {
    enabled: qaEnabledFromProfile(profile),
    registrationReplayEnabled: registrationReplayEnabledFromProfile(profile),
    profile
  }
}

module.exports = {
  QA_SCENARIOS,
  buildRequestId,
  sleep,
  refreshQaAccess,
  qaEnabledFromProfile,
  registrationReplayEnabledFromProfile
}
