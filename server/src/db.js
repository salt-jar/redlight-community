import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function createMysqlDb(config) {
  const mysql = await import('mysql2/promise');
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
