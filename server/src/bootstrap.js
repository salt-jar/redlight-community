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
  await ensureDefaultStores(db);
  await ensureBootstrapAdmins(db, config);
  return { config, db, cache, mailer, online };
}

/** 默认创建两个门店后台入口；已有数据不会被覆盖 */
async function ensureDefaultStores(db) {
  const stores = [
    { id: 1001, name: '一号门店' },
    { id: 1002, name: '二号门店' },
  ];
  for (const store of stores) {
    const rows = await db.query('SELECT id FROM stores WHERE id = ? LIMIT 1', [store.id]);
    if (!rows.length) {
      await db.query('INSERT INTO stores (id, name) VALUES (?, ?)', [store.id, store.name]);
    }
  }
}

/** 首次部署可选：通过 ADMIN_BOOTSTRAP_PASSWORD 自动创建两个门店管理员 */
async function ensureBootstrapAdmins(db, config) {
  if (!config.adminBootstrapPassword) return;
  const admins = [
    { storeId: 1001, username: 'admin1001', displayName: '一号门店管理员' },
    { storeId: 1002, username: 'admin1002', displayName: '二号门店管理员' },
  ];
  for (const admin of admins) {
    const rows = await db.query(
      'SELECT id FROM store_admins WHERE store_id = ? AND username = ? LIMIT 1',
      [admin.storeId, admin.username],
    );
    if (rows.length) continue;
    const { salt, hash } = hashPassword(config.adminBootstrapPassword);
    await db.query(
      'INSERT INTO store_admins (store_id, username, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)',
      [admin.storeId, admin.username, hash, salt, admin.displayName],
    );
  }
}
