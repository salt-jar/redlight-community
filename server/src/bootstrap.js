import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createCache } from './cache.js';
import { createMailer } from './services/mailer.js';
import { createOnlineRegistry } from './online.js';
import { ensureStorage } from './services/storage.js';
import { hashPassword } from './utils/password.js';

/**
 * 组装运行时依赖：数据库、缓存、邮件、在线登记表。
 * 测试可直接调用本函数并传入自定义配置。
 */
export async function createDeps(config = loadConfig()) {
  ensureStorage(config);
  const db = await createDb(config);
  const cache = await createCache(config);
  const mailer = createMailer(config);
  const online = createOnlineRegistry();
  await ensureDefaultOrganization(db);
  await ensureBootstrapOrgAdmin(db, config);
  await ensureDefaultChatGroups(db);
  return { config, db, cache, mailer, online };
}

/** 默认组织 001；一级系统密码存入 system_settings，默认 SQL，可通过 SQL 修改 */
async function ensureDefaultOrganization(db) {
  const rows = await db.query("SELECT code FROM organizations WHERE code = '001' LIMIT 1");
  if (!rows.length) {
    await db.query("INSERT INTO organizations (code, name) VALUES ('001', '赤光社组织')");
  }
  const setting = await db.query("SELECT setting_key FROM system_settings WHERE setting_key = 'org.001.gate_password' LIMIT 1");
  if (!setting.length) {
    await db.query(
      "INSERT INTO system_settings (setting_key, value) VALUES ('org.001.gate_password', 'SQL')",
    );
  }
}

/** 默认群聊分组；已有数据不会覆盖 */
async function ensureDefaultChatGroups(db) {
  const groups = [
    { id: 1, name: '赤光总群', description: '全站同志交流与公告', sortOrder: 1 },
    { id: 2, name: '理论学习', description: '经典著作与理论学习讨论', sortOrder: 2 },
    { id: 3, name: '文献研究', description: '文献整理、版本与阅读心得', sortOrder: 3 },
    { id: 4, name: '青年同志', description: '青年学习与实践活动', sortOrder: 4 },
  ];
  for (const group of groups) {
    const rows = await db.query('SELECT id FROM chat_groups WHERE id = ? LIMIT 1', [group.id]);
    if (!rows.length) {
      await db.query(
        'INSERT INTO chat_groups (id, name, description, sort_order) VALUES (?, ?, ?, ?)',
        [group.id, group.name, group.description, group.sortOrder],
      );
    }
  }
}

/** 首次部署可选：通过 ORG_ADMIN_BOOTSTRAP_PASSWORD 自动创建 001 组织管理员 admin001 */
async function ensureBootstrapOrgAdmin(db, config) {
  if (!config.orgAdminBootstrapPassword) return;
  const rows = await db.query(
    "SELECT id FROM organization_admins WHERE org_code = '001' AND username = 'admin001' LIMIT 1",
  );
  if (rows.length) return;
  const { salt, hash } = hashPassword(config.orgAdminBootstrapPassword);
  await db.query(
    "INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name) VALUES ('001', 'admin001', ?, ?, '组织管理员')",
    [hash, salt],
  );
}
