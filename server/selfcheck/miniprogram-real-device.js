const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ok } = require('./_helpers');

const miniRoot = path.join(__dirname, '..', '..', 'miniprogram');
const projectRoot = path.join(miniRoot, '..');
const appJson = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const projectConfig = JSON.parse(fs.readFileSync(path.join(miniRoot, 'project.config.json'), 'utf8'));
const privateConfigPath = path.join(miniRoot, 'project.private.config.json');
const privateConfig = fs.existsSync(privateConfigPath)
  ? JSON.parse(fs.readFileSync(privateConfigPath, 'utf8'))
  : {};
const appPath = path.join(miniRoot, 'app.js');
const appJs = fs.readFileSync(appPath, 'utf8');
const coverAssetPath = path.join(projectRoot, 'designs', 'wefinally-apple-ui', 'cover-main-image.png');
const coverVisualPath = path.join(projectRoot, 'designs', 'wefinally-apple-ui', 'wefinally-main-cropped.jpg');
const brandedCoverSourcePath = path.join(projectRoot, 'designs', 'wefinally-apple-ui', 'wefinally-cover-branded-source.png');
const brandedCoverPath = path.join(miniRoot, 'assets', 'wefinally-cover-branded.jpg');
const welcomeWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'welcome', 'welcome.wxml'), 'utf8');
const welcomeJs = fs.readFileSync(path.join(miniRoot, 'pages', 'welcome', 'welcome.js'), 'utf8');
const loginWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'login', 'login.wxml'), 'utf8');
const loginJs = fs.readFileSync(path.join(miniRoot, 'pages', 'login', 'login.js'), 'utf8');
const loginWxss = fs.readFileSync(path.join(miniRoot, 'pages', 'login', 'login.wxss'), 'utf8');
const requestJs = fs.readFileSync(path.join(miniRoot, 'utils', 'request.js'), 'utf8');
const constantsJs = fs.readFileSync(path.join(miniRoot, 'utils', 'constants.js'), 'utf8');
const indexJs = fs.readFileSync(path.join(miniRoot, 'pages', 'index', 'index.js'), 'utf8');
const indexWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'index', 'index.wxml'), 'utf8');
const meetSafetyJs = fs.readFileSync(path.join(miniRoot, 'pages', 'meet-safety', 'meet-safety.js'), 'utf8');
const meetSafetyWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'meet-safety', 'meet-safety.wxml'), 'utf8');
const meetSafetyWxss = fs.readFileSync(path.join(miniRoot, 'pages', 'meet-safety', 'meet-safety.wxss'), 'utf8');
const matchSettingWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'match-setting', 'match-setting.wxml'), 'utf8');
const registerWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'register', 'register.wxml'), 'utf8');
const matchDetailWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'match-detail', 'match-detail.wxml'), 'utf8');
const matchDetailWxss = fs.readFileSync(path.join(miniRoot, 'pages', 'match-detail', 'match-detail.wxss'), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function methodBody(source, name) {
  const marker = `\n  ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) return '';
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart + 1, i);
    }
  }
  return '';
}

// Cloud functions are deployed as a separate Node.js runtime and are not part
// of the WeChat app-service JavaScript package.  Keep the device-compatibility
// scan focused on the client entrypoint and client source directories; scanning
// cloudfunction dist/node_modules produces false failures for valid server JS.
const clientJsRoots = [
  appPath,
  ...['pages', 'components', 'utils'].map((name) => path.join(miniRoot, name)),
];
const jsFiles = clientJsRoots.flatMap((root) => {
  if (!fs.existsSync(root)) return [];
  if (fs.statSync(root).isFile()) return [root];
  return walk(root).filter((file) => file.endsWith('.js'));
});
const cloudFunctionsRoot = path.resolve(miniRoot, projectConfig.cloudfunctionRoot || 'cloudfunctions');
const miniFiles = walk(miniRoot).filter((file) => {
  const relative = path.relative(cloudFunctionsRoot, file);
  return relative === '' || (relative.startsWith('..') && !path.isAbsolute(relative));
});
const sourcePackageBytes = miniFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const modernSyntaxFiles = jsFiles.filter((file) => {
  const text = fs.readFileSync(file, 'utf8');
  return /\?\?|\?\./.test(text);
});
const staleWelcomeRedirects = jsFiles.filter((file) => {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.endsWith('/pages/welcome/welcome.js')) return false;
  return fs.readFileSync(file, 'utf8').includes('/pages/welcome/welcome');
});
const homeCallPoliceBody = methodBody(indexJs, 'callPolice');
const meetSosBody = methodBody(meetSafetyJs, 'sos');

const storage = {};
const modals = [];
const requestCalls = [];
const cloudFunctionCalls = [];
let nextRequestResult = null;
let nextCloudResult = null;
let appConfig = null;

const wx = {
  getStorageSync(key) {
    return storage[key];
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  },
  onNetworkStatusChange() {},
  getNetworkType(options) {
    if (options && options.success) options.success({ networkType: 'wifi' });
  },
  showModal(options) {
    modals.push(options);
  },
  showToast() {},
  request(options) {
    requestCalls.push(options);
    const result = nextRequestResult || { fail: { errMsg: 'request:fail mock network error' } };
    nextRequestResult = null;
    if (result.success && options.success) options.success(result.success);
    else if (options.fail) options.fail(result.fail || { errMsg: 'request:fail mock network error' });
  },
  cloud: {
    init(options) {
      storage.__cloudInit = options;
    },
    callFunction(options) {
      cloudFunctionCalls.push(options);
      const result = nextCloudResult || { result: { success: true, data: { message: 'pong', env: 'cloud1-d4gy8l52g08bba326' } } };
      nextCloudResult = null;
      return result.reject ? Promise.reject(result.reject) : Promise.resolve(result);
    },
  },
};

function localRequire(id) {
  if (id.startsWith('./')) return require(path.join(miniRoot, id));
  return require(id);
}

global.wx = wx;

vm.runInNewContext(appJs, {
  App(config) {
    appConfig = config;
  },
  console,
  setTimeout,
  clearTimeout,
  require: localRequire,
  wx,
}, { filename: appPath });

ok('miniprogram app registers successfully', Boolean(appConfig));
ok('miniprogram JS avoids optional chaining/nullish syntax for real-device compatibility', modernSyntaxFiles.length === 0);
ok('app startup avoids top-level module loading for true-device appservice stability', !/^const .*require/m.test(appJs));
ok('login startup path avoids async syntax for true-device compatibility', !loginJs.includes('async ') && !loginJs.includes('await '));
ok('api base getter is exposed for console debugging', typeof appConfig.getApiBaseUrl === 'function');
ok('mini program source package stays below real-device 2MB limit', sourcePackageBytes < 1800 * 1024);
ok('cover handoff image remains outside mini program package', fs.existsSync(coverAssetPath));
ok('original cover visual remains outside mini program package', fs.existsSync(coverVisualPath));
ok('branded cover source remains outside mini program package', fs.existsSync(brandedCoverSourcePath));
ok('mini program uses optimized branded JPG cover', fs.existsSync(brandedCoverPath) && fs.statSync(brandedCoverPath).size < 350 * 1024);
ok('mini program assets do not include oversized cover PNG sources', !fs.existsSync(path.join(miniRoot, 'assets', 'wefinally-cover-generated.png')) && !fs.existsSync(path.join(miniRoot, 'assets', 'wefinally-cover-branded.png')));
ok(
  'welcome is the launch onboarding and logged-out users continue to login',
  appJson.pages[0] === 'pages/welcome/welcome'
    && welcomeJs.includes("wx.redirectTo({ url: '/pages/login/login' })")
);
ok('true-device smoke diagnostic page exists', appJson.pages.includes('pages/smoke/smoke') && fs.existsSync(path.join(miniRoot, 'pages', 'smoke', 'smoke.js')));
ok('devtools fragile lazy code loading is disabled for stable startup', appJson.lazyCodeLoading === undefined);
ok('devtools base library avoids timeout-prone 3.16.x', !String(projectConfig.libVersion || '').startsWith('3.16.') && !String(privateConfig.libVersion || '').startsWith('3.16.'));
ok('devtools upload does not filter app code files', !projectConfig.setting.ignoreDevUnusedFiles && !(privateConfig.setting && privateConfig.setting.ignoreDevUnusedFiles));
ok(
  'devtools risky appservice runtime switches are disabled',
  projectConfig.setting.useIsolateContext === false
    && projectConfig.setting.useMultiFrameRuntime === false
    && projectConfig.setting.useApiHook === false
    && projectConfig.setting.useApiHostProcess === false
    && (!privateConfig.setting || privateConfig.setting.useIsolateContext === false)
    && (!privateConfig.setting || privateConfig.setting.useApiHook === false)
);
ok(
  'devtools upload enables code compression for true-device experience build',
  projectConfig.setting.minified === true
    && projectConfig.setting.minifyWXML === true
    && projectConfig.setting.minifyWXSS === true
);
ok('welcome page uses the branded cover visual', welcomeWxml.includes('/assets/wefinally-cover-branded.jpg'));
ok('login page uses the branded cover visual', loginWxml.includes('/assets/wefinally-cover-branded.jpg'));
ok('login does not replace logo with plain WXML font', !loginWxml.includes('login-brand') && !loginWxss.includes('.login-brand'));
ok('welcome page no longer renders a duplicate login button', !welcomeWxml.includes('微信一键登录') && welcomeJs.includes('/pages/login/login'));
ok('login page owns the single login CTA', (loginWxml.match(/微信一键登录/g) || []).length === 1);
ok('login CTA uses custom view for stable centering', loginWxml.includes('class="login-primary login-btn') && !loginWxml.includes('<button'));
ok('login CTA CSS explicitly centers content', loginWxss.includes('display: flex') && loginWxss.includes('align-items: center') && loginWxss.includes('justify-content: center'));
ok('login CTA is fixed inside the visible viewport', loginWxss.includes('.login-content') && loginWxss.includes('position: fixed') && loginWxss.includes('bottom: 0') && !/\.login-content[\s\S]*?min-height:\s*100vh/.test(loginWxss));
ok('login loading and error states cannot render as a blank page', loginWxss.includes('.login-page .state-wrap') && loginWxss.includes('position: fixed') && loginWxss.includes('bottom: 0'));
ok('login page shows CTA before network probe completes', loginJs.includes("pageState: 'success'") && !/checkNetworkAndInit\(\)\s*\{[\s\S]*?this\.setData\(\{\s*pageState:\s*'loading'/.test(loginJs));
ok('logged-out redirects point to login instead of duplicate welcome', staleWelcomeRedirects.length === 0);
ok('app exposes real-device API health diagnostic', typeof appConfig.debugApiHealth === 'function');
ok('app exposes local reset helper for registration retest', typeof appConfig.resetLocalForRegistration === 'function' && appJs.includes('wf_dev_openid'));
ok('network probe has a timeout fallback instead of hanging pages', appJs.includes('networkCheckTimeoutMs') && appJs.includes('setTimeout') && appJs.includes('finishNetworkCheck'));
ok('request layer uses cloud function instead of wx.request backend', requestJs.includes("require('./cloudApi')") && requestJs.includes('requestByPath') && !requestJs.includes('wx.request'));
ok('request failures hide local backend diagnostics', !requestJs.includes('请确认手机和电脑在同一局域网') && !requestJs.includes('apiBaseUrl'));
ok('mini program declares foreground location private APIs', appJson.requiredPrivateInfos.includes('getLocation') && appJson.requiredPrivateInfos.includes('startLocationUpdate') && appJson.requiredPrivateInfos.includes('onLocationChange'));
ok('common config and homepage SOS API constants exist', constantsJs.includes('COMMON_CONFIG') && constantsJs.includes('/api/common/config') && constantsJs.includes('MEET_SOS') && constantsJs.includes('/api/meet/sos'));
ok('meet safety page uploads foreground location and can finish guard', meetSafetyJs.includes('startLocationUpdate') && meetSafetyJs.includes('/location') && meetSafetyJs.includes('/finish'));
ok('meet safety page reopens latest submitted report by default', meetSafetyJs.includes('loadLatestReport') && meetSafetyJs.includes('/api/meet/list') && meetSafetyJs.includes('row.status) !== 2'));
ok('homepage SOS writes evidence before emergency handoff', indexJs.includes('API_PATHS.MEET_SOS') && indexJs.includes('getLocationForSos'));
ok('homepage SOS prompts before async evidence logging', indexJs.includes('recordHomeSos') && indexJs.indexOf('openEmergencyHelp') < indexJs.indexOf('recordHomeSos'));
ok('homepage exposes one-tap dev registration reset', indexWxml.includes('devResetRegistration') && indexJs.includes('resetLocalForRegistration'));
ok('homepage 110 uses reliable catchtap view', indexWxml.includes('class="safety-call"') && indexWxml.includes('catchtap="callPolice"') && !indexWxml.includes('class="safety-call" bindtap'));
ok('Guangdong 110 default appid is bundled for offline prompt', constantsJs.includes('GUANGDONG_110_DEFAULT') && constantsJs.includes('wxf654be7f2931bfcb'));
ok('app.json avoids devtools-invalid mini program jump allowlist', appJson.navigateToMiniProgramAppIdList === undefined);
ok('Guangdong 110 jump failures are visible to testers', indexJs.includes('广东110打开失败') && meetSafetyJs.includes('广东110打开失败') && indexJs.includes('err.errMsg') && meetSafetyJs.includes('err.errMsg'));
ok('Guangdong 110 jump has API availability and sync-error fallback', indexJs.includes('typeof wx.navigateToMiniProgram') && meetSafetyJs.includes('typeof wx.navigateToMiniProgram') && indexJs.includes('catch (err)') && meetSafetyJs.includes('catch (err)'));
ok('scheme one opens Guangdong 110 mini program instead of dialing phone', !indexJs.includes('makePhoneCall') && !meetSafetyJs.includes('makePhoneCall') && indexJs.includes('wx.navigateToMiniProgram') && meetSafetyJs.includes('wx.navigateToMiniProgram'));
ok('Guangdong 110 mini program handoff carries LBS extraData when available', indexJs.includes('extraData') && meetSafetyJs.includes('extraData') && indexJs.includes('lat') && indexJs.includes('lng') && meetSafetyJs.includes('lat') && meetSafetyJs.includes('lng'));
ok('Guangdong 110 failure guides manual mini program search without phone fallback', indexJs.includes('setClipboardData') && meetSafetyJs.includes('setClipboardData') && indexJs.includes('微信搜索') && meetSafetyJs.includes('微信搜索'));
ok('home 110 button starts Guangdong 110 handoff before location lookup', homeCallPoliceBody.includes('openEmergencyHelp') && homeCallPoliceBody.indexOf('openEmergencyHelp') < homeCallPoliceBody.indexOf('recordHomeSos') && !homeCallPoliceBody.includes('getLocationForSos'));
ok('meet safety SOS starts Guangdong 110 handoff before location lookup', meetSosBody.includes('openEmergencyHelp') && meetSosBody.indexOf('openEmergencyHelp') < meetSosBody.indexOf('recordMeetSos') && !meetSosBody.includes('getCurrentLocation'));
ok('meet safety SOS missing report id is visible to tester', meetSosBody.includes('请先提交安全确认'));
ok('meet safety SOS uses reliable catchtap view', meetSafetyWxml.includes('class="sos-btn"') && meetSafetyWxml.includes('catchtap="sos"') && !meetSafetyWxml.includes('class="sos-btn" bindtap'));
ok('Guangdong 110 handoff is direct and not hidden behind another confirm modal', !indexJs.includes("confirmText: '打开广东110'") && !meetSafetyJs.includes("confirmText: '打开广东110'"));
ok('meet safety page has explicit share-to-family action', meetSafetyWxml.includes('open-type="share"') && meetSafetyJs.includes('onShareAppMessage'));
ok('meet safety page shows foreground guard evidence count', meetSafetyWxml.includes('locationCount') && meetSafetyWxml.includes('latestLocationText'));
ok('meet safety uses native date and time pickers', meetSafetyWxml.includes('mode="date"') && meetSafetyWxml.includes('mode="time"') && meetSafetyJs.includes('onMeetDateChange') && meetSafetyJs.includes('onMeetClockChange'));
ok('meet safety SOS prompts before async evidence logging', meetSafetyJs.includes('recordMeetSos') && meetSafetyJs.indexOf('openEmergencyHelp') < meetSafetyJs.indexOf('recordMeetSos'));
ok('meet safety action buttons use stable centered typography', meetSafetyWxss.includes('.share-btn,') && meetSafetyWxss.includes('display: flex') && meetSafetyWxss.includes('line-height: 1') && meetSafetyWxss.includes('white-space: nowrap'));
ok('supplemental relationship preference options are hidden from user settings', !matchSettingWxml.includes('关系偏好') && !matchSettingWxml.includes('不是心理测评'));
ok('marriage preference labels are user-friendly and backwards compatible', constantsJs.includes('仅看未婚') && constantsJs.includes('可接受离异') && matchSettingWxml.includes('婚史接受度') && fs.readFileSync(path.join(miniRoot, 'pages', 'match-setting', 'match-setting.js'), 'utf8').includes('normalizeLikeMarryLabel'));
ok('register only collects self appearance, not partner appearance preference', !registerWxml.includes('期待对方外貌'));
ok('match detail meet handoff actions are button styled', matchDetailWxml.includes('申请官方奔现对接') && matchDetailWxml.includes('meet-actions') && matchDetailWxss.includes('.meet-action-btn'));

const apiOverride = appConfig.setApiBaseUrl('ignored');
ok('real-device API override is disabled after cloud migration', apiOverride && apiOverride.ok === true && apiOverride.cloud === true && storage.wf_api_base_url === undefined);
ok('api override explains cloud migration', modals.some((item) => String(item.content || '').includes('微信云开发')));

(async () => {
  nextCloudResult = { result: { success: true, data: { message: 'pong', env: 'cloud1-d4gy8l52g08bba326' } } };
  const healthOk = await appConfig.debugApiHealth();
  ok(
    'cloud health diagnostic calls api ping',
    healthOk.ok === true && cloudFunctionCalls[cloudFunctionCalls.length - 1].name === 'api' && cloudFunctionCalls[cloudFunctionCalls.length - 1].data.action === 'ping'
  );

  nextCloudResult = { result: { success: false, error: 'mock cloud timeout' } };
  const healthFail = await appConfig.debugApiHealth();
  ok('cloud health diagnostic returns safe failure detail', healthFail.ok === false && healthFail.errMsg.includes('timeout'));

  const networkOk = await appConfig.checkNetwork(10);
  ok('network probe preserves app context on real-device callbacks', networkOk === true && appConfig.globalData.networkAvailable === true);
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
