import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomCommunityNo, sanitizeUsernameSource } from './utils/identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, 'schema');

/**
 * 统一数据访问层：对外只暴露 async query(sql, params)。
 * - SELECT 返回行数组
 * - INSERT/UPDATE/DELETE 返回 { insertId, affectedRows }
 * @param {ReturnType<import('./config.js').loadConfig>} config
 */
export async function createDb(config) {
  if (config.dbDriver === 'mysql') return createMysqlDb(config);
  return createSqliteDb(config);
}

async function createSqliteDb(config) {
  const { default: Database } = await import('better-sqlite3');
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  const sqlite = new Database(config.dbFile);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(fs.readFileSync(path.join(SCHEMA_DIR, 'sqlite.sql'), 'utf8'));
  ensureSqliteUserIdentity(sqlite);
  ensureSqliteStatusColumns(sqlite);
  ensureSqliteChatGroups(sqlite);

  const normalize = (params = []) =>
    params.map((value) => {
      if (value === undefined) return null;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
      return value;
    });

  const isRead = (sql) => /^\s*(select|with|pragma)\b/i.test(sql);

  return {
    driver: 'sqlite',
    async query(sql, params = []) {
      const statement = sqlite.prepare(sql);
      if (isRead(sql)) return statement.all(...normalize(params));
      const info = statement.run(...normalize(params));
      return { insertId: Number(info.lastInsertRowid), affectedRows: info.changes };
    },
    async close() {
      sqlite.close();
    },
  };
}

function ensureSqliteUserIdentity(sqlite) {
  const columns = new Set(sqlite.prepare("PRAGMA table_info('users')").all().map((column) => column.name));
  if (!columns.has('username')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE');
  }
  if (!columns.has('community_no')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN community_no TEXT');
  }

  const rows = sqlite.prepare('SELECT id, email, nickname, username, community_no FROM users').all();
  const seenUsernames = new Set();
  const seenCommunityNos = new Set();
  const update = sqlite.prepare('UPDATE users SET username = ?, community_no = ? WHERE id = ?');

  for (const row of rows) {
    let username = row.username ? String(row.username).trim() : '';
    let communityNo = row.community_no ? String(row.community_no).trim() : '';

    // 缺失、非法或大小写重复的旧用户名：重新生成唯一值
    if (
      !/^[A-Za-z0-9_\u4e00-\u9fa5]{4,20}$/.test(username) ||
      seenUsernames.has(username.toLowerCase())
    ) {
      const base = sanitizeUsernameSource(row.nickname || String(row.email || '').split('@')[0], row.id);
      let candidate = base;
      let suffix = 1;
      while (seenUsernames.has(candidate.toLowerCase())) {
        const suffixText = `_${row.id}${suffix > 1 ? suffix : ''}`;
        candidate = `${Array.from(base).slice(0, Math.max(1, 20 - suffixText.length)).join('')}${suffixText}`;
        suffix += 1;
      }
      username = candidate;
    }
    seenUsernames.add(username.toLowerCase());

    if (!/^\d{6}$/.test(communityNo) || seenCommunityNos.has(communityNo)) {
      do {
        communityNo = randomCommunityNo();
      } while (seenCommunityNos.has(communityNo));
    }
    seenCommunityNos.add(communityNo);

    if (username !== row.username || communityNo !== row.community_no) {
      update.run(username, communityNo, row.id);
    }
  }

  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS uk_users_username ON users(username)');
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS uk_users_community_no ON users(community_no)');
}

function ensureSqliteStatusColumns(sqlite) {
  const userColumns = new Set(sqlite.prepare("PRAGMA table_info('users')").all().map((column) => column.name));
  if (!userColumns.has('status')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN status INTEGER DEFAULT 1');
  }
  const postColumns = new Set(sqlite.prepare("PRAGMA table_info('posts')").all().map((column) => column.name));
  if (!postColumns.has('status')) {
    sqlite.exec('ALTER TABLE posts ADD COLUMN status INTEGER DEFAULT 1');
  }
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_posts_status_id ON posts(status, id)');
}

function ensureSqliteChatGroups(sqlite) {
  const columns = new Set(sqlite.prepare("PRAGMA table_info('chat_messages')").all().map((column) => column.name));
  if (!columns.has('group_id')) {
    sqlite.exec('ALTER TABLE chat_messages ADD COLUMN group_id INTEGER NOT NULL DEFAULT 1');
  }
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_chat_group ON chat_messages(group_id, id)');
}

async function createMysqlDb(config) {  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
  });

  return {
    driver: 'mysql',
    async query(sql, params = []) {
      const [result] = await pool.query(sql, params);
      if (Array.isArray(result)) return result;
      return { insertId: Number(result.insertId) || 0, affectedRows: Number(result.affectedRows) || 0 };
    },
    async close() {
      await pool.end();
    },
  };
}
