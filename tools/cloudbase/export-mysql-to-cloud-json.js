const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'cloudbase-export');

function loadServerEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    const idx = text.indexOf('=');
    if (idx <= 0) return;
    const key = text.slice(0, idx).trim();
    let value = text.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

loadServerEnv(path.join(root, 'server', '.env'));

const pool = require('../../server/src/config/db');

const tableToCollection = {
  user: 'users',
  user_match_setting: 'user_match_settings',
  user_match_log: 'user_match_logs',
  occupation_circle: 'occupation_circles',
  user_order: 'user_orders',
  marry_report: 'marry_reports',
  system_stat: 'system_stats',
  ai_chat_log: 'ai_chat_logs',
  ai_knowledge: 'ai_knowledge',
  meet_report: 'meet_reports',
  meet_location_log: 'meet_location_logs',
  sos_log: 'sos_logs',
  free_whitelist: 'free_whitelist',
  free_whitelist_import_batch: 'free_whitelist_import_batches',
  match_handoff_ticket: 'match_handoff_tickets',
  partner: 'partners',
  partner_withdraw: 'partner_withdrawals',
  admin: 'admins',
  openid_blacklist: 'openid_blacklist',
  user_privacy_auth_log: 'user_privacy_auth_logs',
  partner_user_audit_log: 'partner_user_audit_logs',
  member_application: 'member_applications'
};

function toCloudValue(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function stableDocId(table, collection, row) {
  if (row.id !== undefined && row.id !== null) return `${collection}_${row.id}`;
  if (table === 'openid_blacklist' && row.openid) return `${collection}_${row.openid}`;
  if (row.openid) return `${collection}_${row.openid}`;
  return `${collection}_${Math.random().toString(36).slice(2)}`;
}

function toCloudDoc(table, collection, row) {
  const doc = {};
  Object.keys(row).forEach((key) => {
    doc[key] = toCloudValue(row[key]);
  });
  doc._id = stableDocId(table, collection, row);
  if (row.id !== undefined && row.id !== null) doc.legacyId = row.id;
  if (row.create_time && !doc.createdAt) doc.createdAt = toCloudValue(row.create_time);
  if (row.update_time && !doc.updatedAt) doc.updatedAt = toCloudValue(row.update_time);
  return doc;
}

async function exportTable(table, collection) {
  const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
  const docs = rows.map((row) => toCloudDoc(table, collection, row));
  const file = path.join(outDir, `${collection}.json`);
  fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8');
  return { table, collection, count: docs.length, file };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];
  for (const table of Object.keys(tableToCollection)) {
    const collection = tableToCollection[table];
    try {
      const item = await exportTable(table, collection);
      manifest.push(item);
      console.log(`exported ${table} -> ${collection}: ${item.count}`);
    } catch (err) {
      manifest.push({ table, collection, count: 0, skipped: true, error: err.message });
      console.warn(`skip ${table}: ${err.message}`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  const successCount = manifest.filter((item) => !item.skipped).length;
  await pool.end();
  if (successCount === 0) {
    throw new Error('没有成功导出任何表，请检查 server/.env 的 DB_HOST/DB_USER/DB_PASSWORD/DB_NAME');
  }
  console.log(`cloudbase json written to: ${outDir}`);
}

main().catch(async (err) => {
  console.error(err.stack || err.message);
  try {
    await pool.end();
  } catch (e) {}
  process.exit(1);
});
