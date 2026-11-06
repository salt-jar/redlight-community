#!/usr/bin/env node
/**
 * 查看赤光社登录数据库（SQLite）。
 *
 * 用法：
 *   npm run logins
 *   npm run logins -- --limit 50
 *   npm run logins -- --status fail
 *   npm run logins -- --email reader@example.com
 *   npm run logins -- --stats
 *   npm run logins -- --json
 *   npm run logins -- --db D:\path\to\redlight.db
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from '../src/config.js';

const HELP = `
赤光社登录数据库查看工具

用法：
  npm run logins [选项]

选项：
  --limit <n>        显示最近 n 条，默认 20，最大 200
  --email <关键词>   按邮箱模糊筛选，例如 reader@example.com 或 @qq.com
  --status <状态>    success / fail / 1 / 0 / 成功 / 失败
  --stats            额外显示按天的登录统计
  --json             以 JSON 输出，便于二次处理
  --db <路径>        指定 SQLite 文件（默认读取 .env 的 DB_FILE）
  --help, -h         显示本帮助

示例：
  npm run logins
  npm run logins -- --limit 50 --status fail
  npm run logins -- --json > logins.json
`.trim();

function parseArgs(argv) {
  const options = { limit: 20, email: '', status: null, stats: false, json: false, db: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--limit') {
      options.limit = Number(argv[++index]);
    } else if (arg === '--email') {
      options.email = String(argv[++index] || '').trim();
    } else if (arg === '--status') {
      options.status = String(argv[++index] || '').trim();
    } else if (arg === '--stats') {
      options.stats = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--db') {
      options.db = String(argv[++index] || '').trim();
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

function parseStatus(value) {
  if (value === null) return null;
  const normalized = String(value).toLowerCase().trim();
  if (['success', '1', '成功'].includes(normalized)) return 1;
  if (['fail', 'failed', '0', '失败'].includes(normalized)) return 0;
  throw new Error(`无法识别的状态：${value}（可用 success / fail / 1 / 0 / 成功 / 失败）`);
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printTable(rows) {
  console.table(
    rows.map((row) => ({
      ID: row.id,
      '登录时间（本地）': row.created_at_local || row.created_at,
      状态: Number(row.status) === 1 ? '成功' : '失败',
      昵称: row.nickname || '未注册用户',
      邮箱: truncate(row.email, 28),
      IP: row.login_ip || '-',
      'User-Agent': truncate(row.user_agent, 44) || '-',
    })),
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error('--limit 必须是大于 0 的数字');
  }
  const limit = Math.min(Math.floor(options.limit), 200);
  const status = parseStatus(options.status);

  const config = loadConfig();
  if (config.dbDriver === 'mysql' && !options.db) {
    throw new Error(
      '当前 .env 使用 DB_DRIVER=mysql。请用 MySQL 客户端查询 login_log_details 视图，' +
        '或用 --db 指定一个 SQLite 文件。详见 DATABASE.md。',
    );
  }

  const dbPath = options.db ? path.resolve(process.cwd(), options.db) : config.dbFile;
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `数据库不存在：${dbPath}\n` +
        '请先在项目根目录运行 npm run dev 启动服务并登录一次，或检查 .env 中的 DB_FILE。',
    );
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const overall = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS success,
           COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS fail,
           COUNT(DISTINCT email) AS emails
         FROM login_logs`,
      )
      .get();

    const where = [];
    const params = [];
    if (options.email) {
      where.push('l.email LIKE ?');
      params.push(`%${options.email}%`);
    }
    if (status !== null) {
      where.push('l.status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const filtered = db
      .prepare(`SELECT COUNT(*) AS total FROM login_logs l ${whereSql}`)
      .get(...params).total;

    const rows = db
      .prepare(
        `SELECT
           l.id,
           l.user_id,
           COALESCE(u.nickname, '未注册用户') AS nickname,
           l.email,
           l.login_ip,
           l.user_agent,
           l.status,
           l.created_at,
           datetime(l.created_at, 'localtime') AS created_at_local
         FROM login_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ${whereSql}
         ORDER BY l.id DESC
         LIMIT ?`,
      )
      .all(...params, limit);

    const daily = options.stats
      ? db
          .prepare(
            `SELECT login_date, total_count, success_count, fail_count, unique_emails
             FROM login_stats_daily
             ORDER BY login_date DESC
             LIMIT 14`,
          )
          .all()
      : [];

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            database: dbPath,
            summary: {
              total: Number(overall.total),
              success: Number(overall.success),
              fail: Number(overall.fail),
              uniqueEmails: Number(overall.emails),
              filtered: Number(filtered),
            },
            rows,
            daily,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`数据库：${dbPath}`);
    console.log(
      `总登录尝试：${overall.total} 条（成功 ${overall.success} / 失败 ${overall.fail}，独立邮箱 ${overall.emails} 个）`,
    );
    console.log(`当前筛选：${filtered} 条，显示最近 ${rows.length} 条\n`);

    if (rows.length === 0) {
      console.log('暂无符合条件的登录记录。');
      console.log('提示：打开 http://127.0.0.1:5173 登录一次即可生成记录；输入错误验证码会产生失败记录。');
    } else {
      printTable(rows);
    }

    if (options.stats) {
      console.log('\n按天统计（最近 14 天）：');
      if (daily.length === 0) console.log('暂无统计数据。');
      else console.table(daily);
    }
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(`\n[logins] ${error.message}\n`);
  console.error('如需帮助：npm run logins -- --help');
  process.exitCode = 1;
}
