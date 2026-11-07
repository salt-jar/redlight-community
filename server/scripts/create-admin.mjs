import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { hashPassword } from '../src/utils/password.js';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : '';
    args[name] = value;
    if (value) index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const storeId = Number(args.store || 1001);
const username = String(args.username || '').trim();
const password = String(args.password || '');
const displayName = String(args.name || '').trim() || username;

if (!Number.isSafeInteger(storeId) || storeId <= 0) {
  console.error('用法：node scripts/create-admin.mjs --store 1001 --username admin --password "至少8位密码" [--name "一号门店管理员"]');
  process.exit(1);
}
if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,32}$/.test(username)) {
  console.error('管理员账号需为 2–32 位中文、字母、数字或下划线');
  process.exit(1);
}
if (password.length < 8) {
  console.error('个人登录密码至少 8 位');
  process.exit(1);
}

const config = loadConfig();
const db = await createDb(config);
try {
  const stores = await db.query('SELECT id FROM stores WHERE id = ? LIMIT 1', [storeId]);
  if (!stores.length) {
    await db.query('INSERT INTO stores (id, name) VALUES (?, ?)', [storeId, `门店 ${storeId}`]);
  }

  const existing = await db.query(
    'SELECT id FROM store_admins WHERE store_id = ? AND username = ? LIMIT 1',
    [storeId, username],
  );
  const { salt, hash } = hashPassword(password);
  if (existing.length) {
    await db.query(
      'UPDATE store_admins SET password_hash = ?, password_salt = ?, display_name = ?, status = 1 WHERE id = ?',
      [hash, salt, displayName, existing[0].id],
    );
    console.log(`已更新管理员：门店 ${storeId} / ${username}（ID ${existing[0].id}）`);
  } else {
    const result = await db.query(
      'INSERT INTO store_admins (store_id, username, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)',
      [storeId, username, hash, salt, displayName],
    );
    console.log(`已创建管理员：门店 ${storeId} / ${username}（ID ${result.insertId}）`);
  }
} finally {
  await db.close();
}
