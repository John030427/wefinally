const modulePath = '../src/services/devWxLogin';

function ok(name, condition) {
  if (!condition) throw new Error(`FAIL - ${name}`);
  console.log(`PASS - ${name}`);
}

function withEnv(env, fn) {
  const keys = ['NODE_ENV', 'DEV_WX_LOGIN_ENABLED', 'DEV_WX_OPENID'];
  const original = {};
  keys.forEach((key) => {
    original[key] = process.env[key];
    delete process.env[key];
  });
  Object.assign(process.env, env);
  try {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    return fn(require(modulePath));
  } finally {
    keys.forEach((key) => {
      delete process.env[key];
      if (original[key] !== undefined) process.env[key] = original[key];
    });
  }
}

(async () => {
  withEnv({ NODE_ENV: 'development' }, (devWxLogin) => {
    ok('dev wx login is disabled by default', devWxLogin.isDevWxLoginEnabled() === false);
  });

  withEnv({ NODE_ENV: 'production', DEV_WX_LOGIN_ENABLED: 'true' }, (devWxLogin) => {
    ok('dev wx login stays disabled in production', devWxLogin.isDevWxLoginEnabled() === false);
  });

  withEnv({
    NODE_ENV: 'development',
    DEV_WX_LOGIN_ENABLED: 'true',
    DEV_WX_OPENID: 'sc_dev_login',
  }, (devWxLogin) => {
    ok('dev wx login can be explicitly enabled in development', devWxLogin.isDevWxLoginEnabled() === true);
    const session = devWxLogin.createDevWxSession('any-devtools-code');
    ok('dev wx login returns configured openid', session.openid === 'sc_dev_login');
    ok('dev wx login marks session as local dev only', session.devLogin === true);
    const override = devWxLogin.createDevWxSession('any-devtools-code', process.env, 'uat_register_20260706_001');
    ok('dev wx login can override openid for registration retest', override.openid === 'uat_register_20260706_001');
    const invalid = devWxLogin.createDevWxSession('any-devtools-code', process.env, 'bad openid');
    ok('dev wx login ignores invalid override openid', invalid.openid === 'sc_dev_login');
  });
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
