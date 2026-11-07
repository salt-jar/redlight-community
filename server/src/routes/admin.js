import express from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { createAdminGuard } from '../middleware/adminAuth.js';
import { verifyPassword, safeCompare } from '../utils/password.js';
import { serializeBook, serializePublicUser, toIso } from '../utils/serialize.js';

const REPORT_REASONS = new Set(['违法违规', '色情低俗', '侵权盗版', '垃圾广告', '人身攻击', '其他']);
const POST_STATUS = new Set([0, 1]);
const BOOK_STATUS = new Set([0, 1]);
const USER_STATUS = new Set([0, 1]);

function parseId(value, label = '资源') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, `${label}不存在`);
  return id;
}

function parseStatus(value, allowed, label) {
  const status = Number(value);
  if (!allowed.has(status)) throw new HttpError(400, `${label}状态不合法`);
  return status;
}

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

async function checkAdminAttempts(cache, key, limit = 10) {
  const count = Number((await cache.get(key)) || 0);
  if (count >= limit) throw new HttpError(429, '尝试次数过多，请 10 分钟后再试');
  return count;
}

async function recordAdminFailure(cache, key, count) {
  await cache.set(key, String(count + 1), 600);
}

/**
 * 管理员后台 API。
 * 当前社区内容为全站共享，门店用于隔离管理员账号与登录入口；
 * 举报队列、文章、图书、用户管理均为全站范围。
 */
export function createAdminRouter({ db, config, cache, adminGuard }) {
  const router = express.Router();
  const authGuard = adminGuard || createAdminGuard(config, db);

  function signGateToken(storeId) {
    return jwtSign({ type: 'admin-gate', storeId }, config.jwtSecret, '10m');
  }

  async function getStore(storeId) {
    const id = parseId(storeId, '门店');
    const rows = await db.query('SELECT * FROM stores WHERE id = ? AND status = 1 LIMIT 1', [id]);
    if (!rows.length) throw new HttpError(404, '门店不存在或已停用');
    return rows[0];
  }

  async function getAdminById(id) {
    const rows = await db.query('SELECT * FROM store_admins WHERE id = ? AND status = 1 LIMIT 1', [id]);
    return rows[0] || null;
  }

  async function getReport(id) {
    const rows = await db.query('SELECT * FROM reports WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  async function targetInfo(report) {
    if (report.target_type === 'post') {
      const rows = await db.query(
        `SELECT p.id, p.content, p.status, p.created_at, p.user_id,
                u.nickname AS author_nickname, u.username AS author_username,
                u.community_no AS author_community_no, u.status AS author_status
         FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ? LIMIT 1`,
        [report.target_id],
      );
      const post = rows[0];
      return post
        ? {
            kind: 'post',
            id: post.id,
            title: String(post.content || '').slice(0, 60) || '(无正文)',
            content: post.content || '',
            status: Number(post.status),
            createdAt: toIso(post.created_at),
            author: {
              id: post.user_id,
              nickname: post.author_nickname || '未知用户',
              username: post.author_username || '',
              communityNo: post.author_community_no || '',
              status: Number(post.author_status ?? 1),
            },
          }
        : null;
    }
    if (report.target_type === 'book') {
      const rows = await db.query(
        `SELECT b.id, b.title, b.author, b.status, b.created_at, b.uploader_id,
                u.nickname AS uploader_nickname, u.username AS uploader_username,
                u.community_no AS uploader_community_no, u.status AS uploader_status
         FROM books b LEFT JOIN users u ON u.id = b.uploader_id WHERE b.id = ? LIMIT 1`,
        [report.target_id],
      );
      const book = rows[0];
      return book
        ? {
            kind: 'book',
            id: book.id,
            title: book.title,
            author: book.author || '',
            status: Number(book.status),
            createdAt: toIso(book.created_at),
            uploader: {
              id: book.uploader_id,
              nickname: book.uploader_nickname || '未知用户',
              username: book.uploader_username || '',
              communityNo: book.uploader_community_no || '',
              status: Number(book.uploader_status ?? 1),
            },
          }
        : null;
    }
    return null;
  }

  async function serializeReport(row) {
    return {
      id: Number(row.id),
      targetType: row.target_type,
      targetId: Number(row.target_id),
      reason: row.reason,
      detail: row.detail || '',
      status: Number(row.status),
      action: row.action || '',
      reporter: {
        id: Number(row.reporter_id),
        nickname: row.reporter_nickname || '未知用户',
        username: row.reporter_username || '',
        communityNo: row.reporter_community_no || '',
      },
      createdAt: toIso(row.created_at),
      handledAt: toIso(row.handled_at),
      target: await targetInfo(row),
    };
  }

  // 门店信息（进入后台前展示）
  router.get(
    '/stores/:storeId/public',
    asyncHandler(async (req, res) => {
      const store = await getStore(req.params.storeId);
      res.json({ store: { id: Number(store.id), name: store.name } });
    }),
  );

  // 第一级：统一管理密码
  router.post(
    '/gate',
    asyncHandler(async (req, res) => {
      const store = await getStore(req.body?.storeId);
      const password = String(req.body?.password || '');
      if (!password) throw new HttpError(400, '请输入统一管理密码');
      const attemptKey = `admin:gate:${requestIp(req)}`;
      const attempts = await checkAdminAttempts(cache, attemptKey);
      if (!safeCompare(password, config.adminGatePassword)) {
        await recordAdminFailure(cache, attemptKey, attempts);
        throw new HttpError(403, '统一管理密码错误');
      }
      await cache.del(attemptKey);
      res.json({
        success: true,
        gateToken: signGateToken(Number(store.id)),
        expiresIn: 600,
        store: { id: Number(store.id), name: store.name },
      });
    }),
  );

  // 第二级：门店管理员个人账号密码
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const storeId = parseId(req.body?.storeId, '门店');
      const gateToken = String(req.body?.gateToken || '');
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      if (!username || !password) throw new HttpError(400, '请输入管理员账号和密码');

      let gatePayload;
      try {
        gatePayload = jwtVerify(gateToken, config.jwtSecret);
      } catch {
        throw new HttpError(401, '管理验证已过期，请重新输入统一密码');
      }
      if (gatePayload.type !== 'admin-gate' || Number(gatePayload.storeId) !== storeId) {
        throw new HttpError(401, '管理验证无效，请重新进入');
      }

      const attemptKey = `admin:login:${requestIp(req)}:${storeId}`;
      const attempts = await checkAdminAttempts(cache, attemptKey);
      const rows = await db.query(
        'SELECT * FROM store_admins WHERE store_id = ? AND username = ? AND status = 1 LIMIT 1',
        [storeId, username],
      );
      const admin = rows[0];
      if (!admin || !verifyPassword(password, admin.password_salt, admin.password_hash)) {
        await recordAdminFailure(cache, attemptKey, attempts);
        throw new HttpError(401, '管理员账号或密码错误');
      }
      await cache.del(attemptKey);

      const store = await getStore(storeId);
      await db.query('UPDATE store_admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
      const token = jwtSign({ type: 'admin', adminId: Number(admin.id), storeId }, config.jwtSecret, config.adminTokenExpiresIn || '2h');
      res.json({
        token,
        admin: {
          id: Number(admin.id),
          username: admin.username,
          displayName: admin.display_name || admin.username,
          storeId,
        },
        store: { id: Number(store.id), name: store.name },
      });
    }),
  );

  router.get(
    '/me',
    authGuard,
    asyncHandler(async (req, res) => {
      const admin = await getAdminById(req.adminId);
      const store = await getStore(req.storeId);
      res.json({
        admin: { id: Number(admin.id), username: admin.username, displayName: admin.display_name || admin.username, storeId: Number(admin.store_id) },
        store: { id: Number(store.id), name: store.name },
      });
    }),
  );

  router.get(
    '/stats',
    authGuard,
    asyncHandler(async (_req, res) => {
      const [pendingReports, posts, books, blockedUsers, users] = await Promise.all([
        db.query('SELECT COUNT(*) AS total FROM reports WHERE status = 0'),
        db.query('SELECT COUNT(*) AS total FROM posts'),
        db.query('SELECT COUNT(*) AS total FROM books'),
        db.query('SELECT COUNT(*) AS total FROM users WHERE status = 0'),
        db.query('SELECT COUNT(*) AS total FROM users'),
      ]);
      res.json({
        pendingReports: Number(pendingReports[0]?.total || 0),
        posts: Number(posts[0]?.total || 0),
        books: Number(books[0]?.total || 0),
        blockedUsers: Number(blockedUsers[0]?.total || 0),
        users: Number(users[0]?.total || 0),
      });
    }),
  );

  router.get(
    '/reports',
    authGuard,
    asyncHandler(async (req, res) => {
      const { page, size, offset } = parsePagination(req.query, 20, 100);
      const status = req.query.status === 'all' ? null : Number(req.query.status ?? 0);
      const params = [];
      const where = [];
      if (status !== null) {
        if (![0, 1, 2].includes(status)) throw new HttpError(400, '举报状态不合法');
        where.push('r.status = ?');
        params.push(status);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.query(
        `SELECT r.*, u.nickname AS reporter_nickname, u.username AS reporter_username,
                u.community_no AS reporter_community_no
         FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
         ${whereSql} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
        [...params, size, offset],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM reports r ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      const list = await Promise.all(rows.map(serializeReport));
      res.json({ list, page, size, total, hasMore: offset + list.length < total });
    }),
  );

  router.post(
    '/reports/:id/action',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '举报');
      const report = await getReport(id);
      if (!report) throw new HttpError(404, '举报不存在');
      if (Number(report.status) !== 0) throw new HttpError(409, '该举报已处理');
      const action = String(req.body?.action || '');
      let nextStatus = 1;
      let targetStatus = null;

      if (action === 'dismiss') {
        nextStatus = 2;
      } else if (action === 'remove_post') {
        if (report.target_type !== 'post') throw new HttpError(400, '该举报目标不是文章');
        await db.query('UPDATE posts SET status = 0 WHERE id = ?', [report.target_id]);
        await cache.del('stats:hot-topics');
        targetStatus = 0;
      } else if (action === 'remove_book') {
        if (report.target_type !== 'book') throw new HttpError(400, '该举报目标不是图书');
        await db.query('UPDATE books SET status = 0 WHERE id = ?', [report.target_id]);
        targetStatus = 0;
      } else if (action === 'block_user') {
        let userId = null;
        if (report.target_type === 'post') {
          const rows = await db.query('SELECT user_id FROM posts WHERE id = ? LIMIT 1', [report.target_id]);
          userId = rows[0]?.user_id;
        } else if (report.target_type === 'book') {
          const rows = await db.query('SELECT uploader_id FROM books WHERE id = ? LIMIT 1', [report.target_id]);
          userId = rows[0]?.uploader_id;
        }
        if (!userId) throw new HttpError(400, '无法定位被举报用户');
        await db.query('UPDATE users SET status = 0 WHERE id = ?', [userId]);
        targetStatus = 0;
      } else {
        throw new HttpError(400, '不支持的举报处理动作');
      }

      await db.query(
        'UPDATE reports SET status = ?, action = ?, handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?',
        [nextStatus, action, req.adminId, id],
      );
      const updated = await getReport(id);
      const rows = await db.query(
        `SELECT r.*, u.nickname AS reporter_nickname, u.username AS reporter_username,
                u.community_no AS reporter_community_no
         FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.id = ? LIMIT 1`,
        [id],
      );
      res.json({ success: true, targetStatus, report: await serializeReport(rows[0] || updated) });
    }),
  );

  router.get(
    '/posts',
    authGuard,
    asyncHandler(async (req, res) => {
      const { page, size, offset } = parsePagination(req.query, 20, 100);
      const q = String(req.query.q || '').trim();
      const where = [];
      const params = [];
      if (q) {
        where.push('p.content LIKE ?');
        params.push(`%${q}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.query(
        `SELECT p.*, u.nickname AS author_nickname, u.username AS author_username,
                u.community_no AS author_community_no, u.status AS author_status
         FROM posts p LEFT JOIN users u ON u.id = p.user_id
         ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
        [...params, size, offset],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM posts p ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      const list = rows.map((row) => ({
        id: Number(row.id),
        content: row.content || '',
        status: Number(row.status),
        createdAt: toIso(row.created_at),
        author: {
          id: Number(row.user_id),
          nickname: row.author_nickname || '未知用户',
          username: row.author_username || '',
          communityNo: row.author_community_no || '',
          status: Number(row.author_status ?? 1),
        },
      }));
      res.json({ list, page, size, total, hasMore: offset + list.length < total });
    }),
  );

  router.post(
    '/posts/:id/status',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '文章');
      const status = parseStatus(req.body?.status, POST_STATUS, '文章');
      const result = await db.query('UPDATE posts SET status = ? WHERE id = ?', [status, id]);
      if (!result.affectedRows) throw new HttpError(404, '文章不存在');
      await cache.del('stats:hot-topics');
      res.json({ success: true, status });
    }),
  );

  router.get(
    '/books',
    authGuard,
    asyncHandler(async (req, res) => {
      const { page, size, offset } = parsePagination(req.query, 20, 100);
      const q = String(req.query.q || '').trim();
      const where = [];
      const params = [];
      if (q) {
        where.push('(b.title LIKE ? OR b.author LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.query(
        `SELECT b.*, u.nickname AS uploader_nickname, u.username AS uploader_username,
                u.status AS uploader_status
         FROM books b LEFT JOIN users u ON u.id = b.uploader_id
         ${whereSql} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
        [...params, size, offset],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM books b ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      const list = rows.map((row) => ({
        ...serializeBook(row),
        uploader: {
          id: Number(row.uploader_id),
          nickname: row.uploader_nickname || '未知用户',
          username: row.uploader_username || '',
          status: Number(row.uploader_status ?? 1),
        },
      }));
      res.json({ list, page, size, total, hasMore: offset + list.length < total });
    }),
  );

  router.post(
    '/books/:id/status',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '图书');
      const status = parseStatus(req.body?.status, BOOK_STATUS, '图书');
      const result = await db.query('UPDATE books SET status = ? WHERE id = ?', [status, id]);
      if (!result.affectedRows) throw new HttpError(404, '图书不存在');
      res.json({ success: true, status });
    }),
  );

  router.get(
    '/users',
    authGuard,
    asyncHandler(async (req, res) => {
      const { page, size, offset } = parsePagination(req.query, 20, 100);
      const q = String(req.query.q || '').trim();
      const where = [];
      const params = [];
      if (q) {
        where.push('(nickname LIKE ? OR username LIKE ? OR community_no LIKE ? OR email LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.query(
        `SELECT * FROM users ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, size, offset],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      const list = rows.map((row) => ({
        ...serializePublicUser(row),
        email: row.email,
        status: Number(row.status ?? 1),
      }));
      res.json({ list, page, size, total, hasMore: offset + list.length < total });
    }),
  );

  router.post(
    '/users/:id/status',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '用户');
      const status = parseStatus(req.body?.status, USER_STATUS, '用户');
      const result = await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
      if (!result.affectedRows) throw new HttpError(404, '用户不存在');
      res.json({ success: true, status });
    }),
  );

  return router;
}

function jwtSign(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn });
}

function jwtVerify(token, secret) {
  return jwt.verify(token, secret);
}
