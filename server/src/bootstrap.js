import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createCache } from './cache.js';
import { createMailer } from './services/mailer.js';
import { createOnlineRegistry } from './online.js';
import { ensureStorage } from './services/storage.js';

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
  return { config, db, cache, mailer, online };
}
