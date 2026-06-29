// 一次性迁移：user.height_range 精确值(如 175cm) → 区间档位(170-180cm)。已是区间则跳过。
// 跑法（从 server 目录，确保读到 server/.env）：  cd server && node ../database/migrate-height-to-range.js
const pool = require('../server/src/config/db'); // db.js 内已 require('dotenv').config()

function toBand(s) {
  const m = String(s || '').match(/\d+/g);
  if (!m) return null;
  if (m.length >= 2) return null; // 已是区间，跳过
  const h = Number(m[0]);
  if (h >= 190) return '190cm以上';
  const lo = Math.max(150, Math.floor(h / 10) * 10);
  return `${lo}-${lo + 10}cm`;
}

(async () => {
  const [rows] = await pool.query('SELECT id, height_range FROM `user`');
  let n = 0;
  for (const r of rows) {
    const band = toBand(r.height_range);
    if (band && band !== r.height_range) {
      await pool.query('UPDATE `user` SET height_range = ? WHERE id = ?', [band, r.id]);
      n += 1;
    }
  }
  console.log(`migrated ${n}/${rows.length}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
