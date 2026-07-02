const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isDevWxLoginEnabled(env = process.env) {
  return env.NODE_ENV === 'development'
    && TRUE_VALUES.has(String(env.DEV_WX_LOGIN_ENABLED || '').toLowerCase());
}

function createDevWxSession(code, env = process.env) {
  if (!isDevWxLoginEnabled(env)) return null;
  if (!code) throw new Error('缺少 code');
  return {
    openid: env.DEV_WX_OPENID || 'dev_wefinally_local_openid',
    session_key: 'dev-local-session-key',
    devLogin: true,
  };
}

module.exports = {
  createDevWxSession,
  isDevWxLoginEnabled,
};
