import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { hashPassword } from '../src/utils/password.js';
import { generateCommunityNo } from '../src/utils/identity.js';
import { ensureAdminCommunityUser } from '../src/services/adminAccounts.js';

const config = loadConfig();
const db = await createDb(config);

async function ensureNormalUser({ email, nickname, username, bio }) {
  const rows = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  if (rows.length) return rows[0];
  const communityNo = await generateCommunityNo(db);
  const result = await db.query(
    'INSERT INTO users (email, nickname, username, community_no, bio, role) VALUES (?, ?, ?, ?, ?, 0)',
    [email, nickname, username, communityNo, bio],
  );
  const created = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
  return created[0];
}

try {
  await db.query("INSERT INTO organizations (code, name) VALUES ('001', '赤光社组织') ON CONFLICT DO NOTHING");
  const gate = await db.query("SELECT setting_key FROM system_settings WHERE setting_key = 'org.001.gate_password' LIMIT 1");
  if (!gate.length) {
    await db.query("INSERT INTO system_settings (setting_key, value) VALUES ('org.001.gate_password', 'SQL')");
  }

  const adminPassword = 'Admin@12345';
  const adminUsername = 'demo_admin';
  const adminUser = await ensureAdminCommunityUser(db, {
    email: 'demo_admin@redlight.local',
    username: adminUsername,
    displayName: '赤光管理员',
    orgCode: '001',
  });
  const { salt, hash } = hashPassword(adminPassword);
  const existingAdmin = await db.query(
    "SELECT id FROM organization_admins WHERE org_code = '001' AND username = ? LIMIT 1",
    [adminUsername],
  );
  if (existingAdmin.length) {
    await db.query(
      'UPDATE organization_admins SET password_hash = ?, password_salt = ?, display_name = ?, user_id = ?, status = 1 WHERE id = ?',
      [hash, salt, '赤光管理员', Number(adminUser.id), existingAdmin[0].id],
    );
  } else {
    await db.query(
      'INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['001', adminUsername, hash, salt, '赤光管理员', Number(adminUser.id)],
    );
  }

  const users = [
    {
      email: 'xinghuo@redlight.local',
      nickname: '同志_星火',
      username: 'xinghuo',
      bio: '理论学习与文献阅读爱好者。',
    },
    {
      email: 'shuguang@redlight.local',
      nickname: '同志_曙光',
      username: 'shuguang',
      bio: '关注青年学习与社区实践。',
    },
    {
      email: 'qingnian@redlight.local',
      nickname: '同志_青年',
      username: 'qingnian',
      bio: '在阅读中寻找方向。',
    },
  ];
  const createdUsers = [];
  for (const user of users) {
    createdUsers.push(await ensureNormalUser(user));
  }

  console.log('演示账号已准备完成：');
  console.log(`管理员后台：/org/001`);
  console.log(`  第一级系统密码：以当前 system_settings 中的 org.001.gate_password 为准`);
  console.log(`  管理员账号：${adminUsername}`);
  console.log(`  管理员密码：${adminPassword}`);
  console.log(`  管理员社区邮箱：demo_admin@redlight.local（验证码登录，管理员标识）`);
  for (const user of createdUsers) {
    console.log(`普通用户：${user.email} / @${user.username} / ${user.nickname} / 社区号 ${user.community_no}`);
  }
  console.log('普通用户登录：邮箱验证码；本地开发模式验证码显示在登录页与后端控制台。');
} finally {
  await db.close();
}
