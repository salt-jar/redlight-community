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
const orgCode = String(args.org || '001').trim();
const username = String(args.username || '').trim();
const password = String(args.password || '');
const displayName = String(args.name || '').trim() || username;

if (!/^[A-Za-z0-9_]{2,16}$/.test(orgCode)) {
  console.error('用法：node scripts/create-org-admin.mjs --org 001 --username admin001 --password "至少8位密码" [--name "组织管理员"]');
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
  const orgs = await db.query('SELECT code FROM organizations WHERE code = ? LIMIT 1', [orgCode]);
  if (!orgs.length) {
    await db.query('INSERT INTO organizations (code, name) VALUES (?, ?)', [orgCode, `组织 ${orgCode}`]);
  }
  if (orgCode === '001') {
    const setting = await db.query("SELECT setting_key FROM system_settings WHERE setting_key = 'org.001.gate_password' LIMIT 1");
    if (!setting.length) {
      await db.query("INSERT INTO system_settings (setting_key, value) VALUES ('org.001.gate_password', 'SQL')");
    }
  }

  const existing = await db.query(
    'SELECT id FROM organization_admins WHERE org_code = ? AND username = ? LIMIT 1',
    [orgCode, username],
  );
  const { salt, hash } = hashPassword(password);
  if (existing.length) {
    await db.query(
      'UPDATE organization_admins SET password_hash = ?, password_salt = ?, display_name = ?, status = 1 WHERE id = ?',
      [hash, salt, displayName, existing[0].id],
    );
    console.log(`已更新组织管理员：${orgCode} / ${username}（ID ${existing[0].id}）`);
  } else {
    const result = await db.query(
      'INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)',
      [orgCode, username, hash, salt, displayName],
    );
    console.log(`已创建组织管理员：${orgCode} / ${username}（ID ${result.insertId}）`);
  }
} finally {
  await db.close();
}
