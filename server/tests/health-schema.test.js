import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(__dirname, '..', 'src', 'schema');

function parseMysqlSchema(sql) {
  const tables = new Map();
  const tableRegex = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*ENGINE=/g;
  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const columns = [];
    for (const rawLine of match[2].split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line) continue;
      if (/^(PRIMARY|UNIQUE|KEY|INDEX|FULLTEXT|CONSTRAINT|FOREIGN)\b/i.test(line)) continue;
      const column = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
      if (column) columns.push(column[1]);
    }
    tables.set(match[1], columns);
  }
  return tables;
}

describe('健康检查与数据库 schema', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await createTestContext('health');
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('GET /api/health 返回 ok 与 sqlite driver', async () => {
    const response = await ctx.agent.get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, driver: 'sqlite' });
  });

  it('未知 API 返回 JSON 404', async () => {
    const response = await ctx.agent.get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.msg).toContain('接口不存在');
  });

  it('上传体积限制默认为 100MB', () => {
    expect(ctx.config.limits.zipSize).toBe(100 * 1024 * 1024);
    expect(ctx.config.limits.imageSize).toBe(5 * 1024 * 1024);
  });

  it('MySQL 与 SQLite 两套 schema 表字段一致，且 posts 均含 repost_id', async () => {
    const mysqlSql = fs.readFileSync(path.join(schemaDir, 'mysql.sql'), 'utf8');
    const sqliteSql = fs.readFileSync(path.join(schemaDir, 'sqlite.sql'), 'utf8');
    const mysqlTables = parseMysqlSchema(mysqlSql);
    expect(mysqlTables.size).toBe(7);

    for (const [table, mysqlColumns] of mysqlTables.entries()) {
      const info = await ctx.deps.db.query(`PRAGMA table_info('${table}')`);
      const sqliteColumns = info.map((column) => column.name);
      expect(sqliteColumns, `表 ${table} 字段应一致`).toEqual(mysqlColumns);
    }

    expect(mysqlTables.get('posts')).toContain('repost_id');
    expect(mysqlTables.get('login_logs')).toContain('user_agent');
    expect(mysqlTables.get('books')).toContain('download_count');
  });

  it('登录明细与按天统计视图可用', async () => {
    const views = await ctx.deps.db.query("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name");
    expect(views.map((view) => view.name)).toEqual(['login_log_details', 'login_stats_daily']);

    await ctx.deps.db.query(
      'INSERT INTO login_logs (user_id, email, login_ip, user_agent, status) VALUES (0, ?, ?, ?, 0)',
      ['view-test@example.com', '127.0.0.1', 'vitest-ua'],
    );
    const details = await ctx.deps.db.query(
      'SELECT nickname, status_text, created_at_local FROM login_log_details WHERE email = ?',
      ['view-test@example.com'],
    );
    expect(details).toHaveLength(1);
    expect(details[0].nickname).toBe('未注册用户');
    expect(details[0].status_text).toBe('失败');
    expect(details[0].created_at_local).toBeTruthy();

    const stats = await ctx.deps.db.query('SELECT * FROM login_stats_daily');
    expect(stats).toHaveLength(1);
    expect(Number(stats[0].total_count)).toBe(1);
    expect(Number(stats[0].success_count)).toBe(0);
    expect(Number(stats[0].fail_count)).toBe(1);
  });

  it('FULLTEXT ngram 仅存在于 MySQL schema', () => {
    const mysqlSql = fs.readFileSync(path.join(schemaDir, 'mysql.sql'), 'utf8');
    const sqliteSql = fs.readFileSync(path.join(schemaDir, 'sqlite.sql'), 'utf8');
    expect(mysqlSql).toMatch(/FULLTEXT INDEX ft_book_search[\s\S]*WITH PARSER ngram/);
    expect(sqliteSql).not.toMatch(/FULLTEXT\s+INDEX/i);
    expect(sqliteSql).not.toMatch(/WITH PARSER/i);
    expect(mysqlSql).toMatch(/CREATE OR REPLACE VIEW login_log_details/);
    expect(mysqlSql).toMatch(/CREATE OR REPLACE VIEW login_stats_daily/);
    expect(mysqlSql).toMatch(/idx_repost_id/);
    expect(sqliteSql).toMatch(/idx_posts_repost_id/);
  });
});
