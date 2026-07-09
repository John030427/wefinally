const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function normalizeDevOpenid(openid) {
  const value = String(openid || '').trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(value)) return '';
  return value;
}

function isDevWxLoginEnabled(env = process.env) {
  return env.NODE_ENV === 'development'
    && TRUE_VALUES.has(String(env.DEV_WX_LOGIN_ENABLED || '').toLowerCase());
}

function createDevWxSession(code, env = process.env, overrideOpenid = '') {
  if (!isDevWxLoginEnabled(env)) return null;
  if (!code) throw new Error('缺少 code');
  return {
    openid: normalizeDevOpenid(overrideOpenid) || env.DEV_WX_OPENID || 'dev_wefinally_local_openid',
    session_key: 'dev-local-session-key',
    devLogin: true,
  };
}

module.exports = {
  createDevWxSession,
  isDevWxLoginEnabled,
  normalizeDevOpenid,
};
