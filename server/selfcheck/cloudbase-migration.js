const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const miniRoot = path.join(root, 'miniprogram');
const cloudRoot = path.join(miniRoot, 'cloudfunctions');
const cloudEnv = 'cloud1-d4gy8l52g08bba326';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function ok(name, condition) {
  if (!condition) {
    console.error(`FAIL - ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS - ${name}`);
}

const appJs = read('miniprogram/app.js');
const projectConfig = JSON.parse(read('miniprogram/project.config.json'));
const requestJs = read('miniprogram/utils/request.js');
const appJson = JSON.parse(read('miniprogram/app.json'));
const cloudDbJs = read('miniprogram/cloudfunctions/api/lib/db.js');
const cloudMatchJs = read('miniprogram/cloudfunctions/api/handlers/match.js');
const cloudApiConfig = exists('miniprogram/cloudfunctions/api/config.json')
  ? JSON.parse(read('miniprogram/cloudfunctions/api/config.json'))
  : {};
const cloudMeetJs = read('miniprogram/cloudfunctions/api/handlers/meet.js');
const cloudChatJs = read('miniprogram/cloudfunctions/api/handlers/chat.js');
const cloudRouteJs = read('miniprogram/cloudfunctions/api/handlers/route.js');
const cloudVipJs = read('miniprogram/cloudfunctions/api/handlers/vip.js');
const cloudWechatPayJs = read('miniprogram/cloudfunctions/api/lib/wechatpay.js');
const cloudVipOrderJs = read('miniprogram/cloudfunctions/api/lib/vipOrder.js');
const cloudNotifyJs = read('miniprogram/cloudfunctions/api/handlers/paymentNotify.js');
const cloudCommonJs = read('miniprogram/cloudfunctions/api/handlers/common.js');
const cloudUserJs = read('miniprogram/cloudfunctions/api/handlers/user.js');
const vipPageJs = read('miniprogram/pages/vip/vip.js');
const indexJs = read('miniprogram/pages/index/index.js');
const matchDetailJs = read('miniprogram/pages/match-detail/match-detail.js');
const matchDetailWxml = read('miniprogram/pages/match-detail/match-detail.wxml');
const meetSafetyJs = read('miniprogram/pages/meet-safety/meet-safety.js');
const minimaxHardcodedKeySymbol = ['DEMO', 'MINIMAX', 'API', 'KEY'].join('_');
const matchStartBody = cloudMatchJs.split('async function start')[1]
  ? cloudMatchJs.split('async function start')[1].split('module.exports')[0]
  : cloudMatchJs;

ok('mini program is native WeChat app', Array.isArray(appJson.pages) && appJson.pages.includes('pages/login/login'));
ok('app initializes wx cloud with production env', appJs.includes('wx.cloud.init') && appJs.includes(cloudEnv));
ok('project config declares cloud function root', projectConfig.cloudfunctionRoot === 'cloudfunctions/');
ok('cloud api wrapper exists', exists('miniprogram/utils/cloudApi.js'));
ok('request layer uses cloud api wrapper', requestJs.includes("require('./cloudApi')") && requestJs.includes('requestByPath'));
ok('request layer no longer shows LAN diagnostic to users', !requestJs.includes('请确认手机和电脑在同一局域网') && !requestJs.includes('apiBaseUrl'));
ok('login cloud function exists', fs.existsSync(path.join(cloudRoot, 'login/index.js')));
ok('api cloud function exists', fs.existsSync(path.join(cloudRoot, 'api/index.js')));
ok('api cloud function timeout supports AI report generation', Number(cloudApiConfig.timeout || 0) >= 20);
ok('cloud database writes use stable document ids', cloudDbJs.includes('.doc(doc._id).set') && cloudDbJs.includes('delete writeData._id'));
ok('cloud id generator uses valid counters collection name', cloudDbJs.includes("collection('system_counters')") && !cloudDbJs.includes("collection('_counters')"));
ok('cloud id generator falls back when counters collection is missing', cloudDbJs.includes('fallback id for') && cloudDbJs.includes('Date.now() * 1000'));
ok('cloud manual match is guarded by demo flag', cloudMatchJs.includes('cloud_demo_match_enabled') && cloudMatchJs.includes('测试匹配未开启'));
ok('cloud demo match can seed a candidate under demo flag', cloudMatchJs.includes('dev_seed_current_user_candidates') && cloudMatchJs.includes('cloud_demo_candidate_'));
ok('cloud manual match avoids repeated partners', cloudMatchJs.includes('seenPartnerIds') && cloudMatchJs.includes('暂无新的可用候选'));
ok('cloud MiniMax report helper exists', exists('miniprogram/cloudfunctions/api/lib/minimax.js'));
ok('cloud match report uses MiniMax or deterministic fallback', cloudMatchJs.includes("require('../lib/minimax')") && cloudMatchJs.includes('generateMutualMatchReports') && cloudMatchJs.includes('fallbackMatchReportText'));
ok('cloud MiniMax key can be read from safe runtime config', read('miniprogram/cloudfunctions/api/lib/minimax.js').includes("systemValue('minimax_api_key')"));
ok('cloud MiniMax has no hardcoded key fallback', !read('miniprogram/cloudfunctions/api/lib/minimax.js').includes(minimaxHardcodedKeySymbol));
ok('cloud MiniMax request timeout stays below 3s cloud call limit', read('miniprogram/cloudfunctions/api/lib/minimax.js').includes('CLOUD_FUNCTION_SAFE_TIMEOUT_MS'));
ok('cloud manual match no longer waits for MiniMax report', !matchStartBody.includes('generateMutualMatchReports'));
ok('cloud match detail keeps field breakdown scores', cloudMatchJs.includes('ensureScoreDetailDimensions') && cloudMatchJs.includes('buildDemoScoreDetail'));
ok('cloud exposes manual AI report generation endpoint', cloudMatchJs.includes('async function generateReport') && cloudRouteJs.includes('POST /api/match/report'));
ok('manual AI report keeps fallback separate from real AI report', cloudMatchJs.includes('fallbackReportUsed') && cloudMatchJs.includes('ai_report_text: generatedByAi ? reportTextA :'));
ok('new manual match can open detail with auto AI report generation', indexJs.includes('autoReport=1') && matchDetailJs.includes('autoReportPending') && matchDetailJs.includes('silentReport'));
ok('match detail derives AI report actions from status and text', matchDetailJs.includes('normalizeAiReportState') && matchDetailJs.includes('canGenerateReport') && matchDetailJs.includes('canRefreshReport'));
ok('match detail hides generate button when AI report text exists', matchDetailJs.includes('hasAiReportText') && matchDetailWxml.includes('detail.canGenerateReport'));
ok('match detail shows manual AI report button and progress', matchDetailJs.includes('requestAiReport') && matchDetailJs.includes('reportGenerating') && matchDetailJs.includes('重新生成AI报告') && matchDetailWxml.includes('reportActionText') && matchDetailWxml.includes('AI报告生成中'));
ok('cloud meet reports are scoped to match user', cloudMeetJs.includes('findExistingForMatch') && cloudMeetJs.includes('match_user_id'));
ok('cloud customer service stores handoff context', cloudChatJs.includes('handoff_ticket_id') && cloudChatJs.includes('match_log_id'));
ok('match handoff navigates into customer service chat', matchDetailJs.includes('/pages/chat/chat') && matchDetailJs.includes('handoffTicketId'));
ok('meet safety can load existing report for selected match', meetSafetyJs.includes('loadExistingForMatch') && meetSafetyJs.includes('matchUserId'));
ok('home manual match does not request rematch by default', indexJs.includes('allow_rematch: false'));
ok('cloud demo vip grant is guarded by demo flag', cloudVipJs.includes('cloud_demo_vip_grant_enabled') && !cloudVipJs.includes('data.devGrant === true'));
ok('cloud WeChat Pay utility uses API v3 RSA signing', cloudWechatPayJs.includes('WECHATPAY2-SHA256-RSA2048') && cloudWechatPayJs.includes('RSA-SHA256'));
ok('cloud WeChat Pay utility decrypts APIv3 callback resources', cloudWechatPayJs.includes('aes-256-gcm') && cloudWechatPayJs.includes('decryptResource'));
ok('cloud VIP order service validates paid transaction amount', cloudVipOrderJs.includes('validatePaidTransaction') && cloudVipOrderJs.includes('微信支付金额不匹配'));
ok('cloud VIP order service marks VIP grant idempotently', cloudVipOrderJs.includes('last_vip_order_no') && cloudVipOrderJs.includes('vip_granted'));
ok('cloud WeChat Pay notify handler returns v3 success response', cloudNotifyJs.includes("code: 'SUCCESS'") && cloudNotifyJs.includes('handleWechatPayNotify'));
ok('VIP page waits for backend payment confirmation', vipPageJs.includes('pollOrderStatus') && vipPageJs.includes('API_PATHS.ORDER_STATUS'));
ok('cloud common config exposes demo flags', cloudCommonJs.includes('demoFlags') && cloudCommonJs.includes('demo: await demoFlags()'));
ok('cloud registration does not fail when privacy log collection is missing', cloudUserJs.includes('privacy auth log skipped'));
ok('mysql to cloud json export script exists', exists('tools/cloudbase/export-mysql-to-cloud-json.js'));
ok('cloudbase migration guide exists', exists('project-docs/CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md'));
ok('cloudbase delivery guide exists', exists('project-docs/CLOUDBASE_DELIVERY_2026-07-08.md'));

if (exists('miniprogram/cloudfunctions/api/index.js')) {
  const apiIndex = read('miniprogram/cloudfunctions/api/index.js');
  ok('api cloud function has ping action', apiIndex.includes("case 'ping'"));
  ok('api cloud function has route adapter', apiIndex.includes("case 'request'"));
  ok('api cloud function returns unified success shape', apiIndex.includes('success: true') && apiIndex.includes('success: false'));
}

if (exists('tools/cloudbase/export-mysql-to-cloud-json.js')) {
  const exportScript = read('tools/cloudbase/export-mysql-to-cloud-json.js');
  ok('export script maps mysql tables to cloud collections', exportScript.includes('user_match_log') && exportScript.includes('user_match_logs'));
  ok('export script preserves legacy ids', exportScript.includes('legacyId'));
  ok('export script loads server env and fails on empty export', exportScript.includes('loadServerEnv') && exportScript.includes('没有成功导出任何表'));
}

ok(
  'mini program source avoids hardcoded local backend default',
  !appJs.includes("http://127.0.0.1:3000") && !appJs.includes('10.20.154.54') && !appJs.includes('192.168.1.23:3000')
);

if (process.exitCode) process.exit(process.exitCode);
