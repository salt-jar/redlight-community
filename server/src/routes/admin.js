import express from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { createAdminGuard } from '../middleware/adminAuth.js';
import { ensureAdminCommunityUser, isValidAdminEmail } from '../services/adminAccounts.js';
import { verifyPassword, safeCompare, hashPassword } from '../utils/password.js';
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
 * 管理后台 API。
 * - /org/001：组织管理员，一级系统密码来自 SQL system_settings，二级个人密码。
 * - /sql：面向开发者的 SQL 管理系统，单密码，权限更高，可管理组织、管理员和系统设置。
 * 社区内容与举报队列为全站共享。
 */
export function createAdminRouter({ db, config, cache, adminGuard }) {
  const router = express.Router();
  const authGuard = adminGuard || createAdminGuard(config, db);

  function normalizeOrgCode(value) {
    const code = String(value || '').trim();
    if (!/^[A-Za-z0-9_]{2,16}$/.test(code)) throw new HttpError(404, '组织不存在或已停用');
    return code;
  }

  function signGateToken(orgCode) {
    return jwtSign({ type: 'admin-gate', scope: 'org', orgCode }, config.jwtSecret, '10m');
  }

  async function getOrg(orgCode) {
    const code = normalizeOrgCode(orgCode);
    const rows = await db.query('SELECT * FROM organizations WHERE code = ? AND status = 1 LIMIT 1', [code]);
    if (!rows.length) throw new HttpError(404, '组织不存在或已停用');
    return rows[0];
  }

  async function getOrgGatePassword(orgCode) {
    const rows = await db.query('SELECT value FROM system_settings WHERE setting_key = ? LIMIT 1', [
      `org.${orgCode}.gate_password`,
    ]);
    if (!rows.length) throw new HttpError(503, '组织一级系统密码尚未配置，请先在系统设置中设置');
    return String(rows[0].value);
  }

  async function getAdminById(id) {
    const rows = await db.query('SELECT * FROM organization_admins WHERE id = ? AND status = 1 LIMIT 1', [id]);
    return rows[0] || null;
  }

  function requireDeveloper(req) {
    if (!req.isDeveloper) throw new HttpError(403, '仅 SQL 开发者系统可执行该操作');
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

  // 组织信息（进入后台前展示）
  router.get(
    '/orgs/:orgCode/public',
    asyncHandler(async (req, res) => {
      const org = await getOrg(req.params.orgCode);
      res.json({ organization: { code: org.code, name: org.name } });
    }),
  );

  // 组织第一级：系统设置密码（由 SQL system_settings 配置）
  router.post(
    '/orgs/:orgCode/unlock',
    asyncHandler(async (req, res) => {
      const org = await getOrg(req.params.orgCode);
      const password = String(req.body?.password || '');
      if (!password) throw new HttpError(400, '请输入组织系统密码');
      const attemptKey = `admin:org-gate:${requestIp(req)}:${org.code}`;
      const attempts = await checkAdminAttempts(cache, attemptKey);
      const expected = await getOrgGatePassword(org.code);
      if (!safeCompare(password, expected)) {
        await recordAdminFailure(cache, attemptKey, attempts);
        throw new HttpError(403, '组织系统密码错误');
      }
      await cache.del(attemptKey);
      res.json({
        success: true,
        gateToken: signGateToken(org.code),
        expiresIn: 600,
        organization: { code: org.code, name: org.name },
      });
    }),
  );

  // 组织管理员注册：通过组织一级密码后，同时创建组织管理员与社区用户账号
  router.post(
    '/orgs/:orgCode/register',
    asyncHandler(async (req, res) => {
      const orgCode = normalizeOrgCode(req.params.orgCode);
      const org = await getOrg(orgCode);
      const gateToken = String(req.body?.gateToken || '');
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.displayName || '').trim() || username;
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!username || !password) throw new HttpError(400, '请输入管理员账号和密码');
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,32}$/.test(username)) {
        throw new HttpError(400, '管理员账号需为 2–32 位中文、字母、数字或下划线');
      }
      if (password.length < 8) throw new HttpError(400, '个人登录密码至少 8 位');
      if (!isValidAdminEmail(email)) throw new HttpError(400, '请填写管理员关联社区账号的有效邮箱');
      let gatePayload;
      try {
        gatePayload = jwtVerify(gateToken, config.jwtSecret);
      } catch {
        throw new HttpError(401, '组织验证已过期，请重新输入系统密码');
      }
      if (gatePayload.type !== 'admin-gate' || gatePayload.scope !== 'org' || gatePayload.orgCode !== orgCode) {
        throw new HttpError(401, '组织验证无效，请重新进入');
      }
      const existing = await db.query(
        'SELECT id FROM organization_admins WHERE org_code = ? AND username = ? LIMIT 1',
        [orgCode, username],
      );
      if (existing.length) throw new HttpError(409, '该管理员账号已存在，请直接登录');

      const user = await ensureAdminCommunityUser(db, {
        email,
        username,
        displayName,
        orgCode,
      });
      const { salt, hash } = hashPassword(password);
      const result = await db.query(
        'INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name, user_id, last_login_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [orgCode, username, hash, salt, displayName, Number(user.id)],
      );
      const token = jwtSign(
        { type: 'admin', scope: 'org', adminId: Number(result.insertId), orgCode },
        config.jwtSecret,
        config.adminTokenExpiresIn || '2h',
      );
      res.status(201).json({
        token,
        admin: {
          id: Number(result.insertId),
          username,
          displayName,
          scope: 'org',
          orgCode,
          userId: Number(user.id),
          email: user.email,
        },
        organization: { code: org.code, name: org.name },
      });
    }),
  );

  // 组织第二级：个人管理员账号密码
  router.post(
    '/orgs/:orgCode/login',
    asyncHandler(async (req, res) => {
      const orgCode = normalizeOrgCode(req.params.orgCode);
      const gateToken = String(req.body?.gateToken || '');
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      if (!username || !password) throw new HttpError(400, '请输入管理员账号和密码');

      let gatePayload;
      try {
        gatePayload = jwtVerify(gateToken, config.jwtSecret);
      } catch {
        throw new HttpError(401, '组织验证已过期，请重新输入系统密码');
      }
      if (gatePayload.type !== 'admin-gate' || gatePayload.scope !== 'org' || gatePayload.orgCode !== orgCode) {
        throw new HttpError(401, '组织验证无效，请重新进入');
      }

      const attemptKey = `admin:org-login:${requestIp(req)}:${orgCode}`;
      const attempts = await checkAdminAttempts(cache, attemptKey);
      const rows = await db.query(
        'SELECT * FROM organization_admins WHERE org_code = ? AND username = ? AND status = 1 LIMIT 1',
        [orgCode, username],
      );
      const admin = rows[0];
      if (!admin || !verifyPassword(password, admin.password_salt, admin.password_hash)) {
        await recordAdminFailure(cache, attemptKey, attempts);
        throw new HttpError(401, '管理员账号或密码错误');
      }
      await cache.del(attemptKey);

      let adminUserId = admin.user_id ? Number(admin.user_id) : null;
      let linkedUser = null;
      if (!adminUserId) {
        linkedUser = await ensureAdminCommunityUser(db, {
          email: '',
          username: admin.username,
          displayName: admin.display_name || admin.username,
          orgCode,
        });
        adminUserId = Number(linkedUser.id);
        await db.query('UPDATE organization_admins SET user_id = ? WHERE id = ?', [adminUserId, admin.id]);
      } else {
        const rows = await db.query('SELECT email FROM users WHERE id = ? LIMIT 1', [adminUserId]);
        linkedUser = rows[0] || null;
      }

      const org = await getOrg(orgCode);
      await db.query('UPDATE organization_admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
      const token = jwtSign(
        { type: 'admin', scope: 'org', adminId: Number(admin.id), orgCode },
        config.jwtSecret,
        config.adminTokenExpiresIn || '2h',
      );
      res.json({
        token,
        admin: {
          id: Number(admin.id),
          username: admin.username,
          displayName: admin.display_name || admin.username,
          scope: 'org',
          orgCode,
          userId: adminUserId,
          email: linkedUser?.email || '',
        },
        organization: { code: org.code, name: org.name },
      });
    }),
  );

  // SQL 开发者系统：单密码登录，权限更高
  router.post(
    '/sql/login',
    asyncHandler(async (req, res) => {
      const password = String(req.body?.password || '');
      if (!password) throw new HttpError(400, '请输入 SQL 开发者系统密码');
      const attemptKey = `admin:sql-login:${requestIp(req)}`;
      const attempts = await checkAdminAttempts(cache, attemptKey);
      if (!safeCompare(password, config.sqlAdminPassword)) {
        await recordAdminFailure(cache, attemptKey, attempts);
        throw new HttpError(403, 'SQL 开发者系统密码错误');
      }
      await cache.del(attemptKey);
      const token = jwtSign(
        { type: 'admin', scope: 'sql', adminId: 0 },
        config.jwtSecret,
        config.adminTokenExpiresIn || '2h',
      );
      res.json({
        token,
        admin: {
          id: 0,
          username: 'sql',
          displayName: 'SQL 系统管理员',
          scope: 'sql',
          orgCode: null,
        },
        organization: null,
      });
    }),
  );

  router.get(
    '/me',
    authGuard,
    asyncHandler(async (req, res) => {
      if (req.isDeveloper) {
        return res.json({
          admin: { id: 0, username: 'sql', displayName: 'SQL 系统管理员', scope: 'sql', orgCode: null },
          organization: null,
        });
      }
      const admin = await getAdminById(req.adminId);
      const org = await getOrg(req.orgCode);
      res.json({
        admin: {
          id: Number(admin.id),
          username: admin.username,
          displayName: admin.display_name || admin.username,
          scope: 'org',
          orgCode: admin.org_code,
          userId: admin.user_id ? Number(admin.user_id) : null,
        },
        organization: { code: org.code, name: org.name },
      });
    }),
  );

  // 开发者专属：组织、组织管理员、系统设置
  router.get(
    '/organizations',
    authGuard,
    asyncHandler(async (req, res) => {
      requireDeveloper(req);
      const rows = await db.query(
        `SELECT o.*, (SELECT COUNT(*) FROM organization_admins a WHERE a.org_code = o.code) AS admin_count
         FROM organizations o ORDER BY o.code`,
      );
      res.json({
        list: rows.map((row) => ({
          code: row.code,
          name: row.name,
          status: Number(row.status),
          adminCount: Number(row.admin_count || 0),
          createdAt: toIso(row.created_at),
        })),
      });
    }),
  );

  router.get(
    '/organization-admins',
    authGuard,
    asyncHandler(async (req, res) => {
      requireDeveloper(req);
      const orgCode = req.query.orgCode ? normalizeOrgCode(req.query.orgCode) : null;
      const rows = await db.query(
        `SELECT a.id, a.org_code, a.username, a.display_name, a.status, a.last_login_at, a.created_at,
                a.user_id, u.email AS user_email, u.nickname AS user_nickname, u.username AS user_username,
                u.community_no AS user_community_no
         FROM organization_admins a LEFT JOIN users u ON u.id = a.user_id
         ${orgCode ? 'WHERE a.org_code = ?' : ''} ORDER BY a.id DESC`,
        orgCode ? [orgCode] : [],
      );
      res.json({
        list: rows.map((row) => ({
          id: Number(row.id),
          orgCode: row.org_code,
          username: row.username,
          displayName: row.display_name || row.username,
          status: Number(row.status),
          lastLoginAt: toIso(row.last_login_at),
          createdAt: toIso(row.created_at),
          userId: row.user_id ? Number(row.user_id) : null,
          userEmail: row.user_email || '',
          userNickname: row.user_nickname || '',
          userUsername: row.user_username || '',
          userCommunityNo: row.user_community_no || '',
        })),
      });
    }),
  );

  router.post(
    '/organization-admins',
    authGuard,
    asyncHandler(async (req, res) => {
      requireDeveloper(req);
      const orgCode = normalizeOrgCode(req.body?.orgCode);
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.displayName || '').trim() || username;
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,32}$/.test(username)) {
        throw new HttpError(400, '管理员账号需为 2–32 位中文、字母、数字或下划线');
      }
      if (password.length < 8) throw new HttpError(400, '个人登录密码至少 8 位');
      if (email && !isValidAdminEmail(email)) throw new HttpError(400, '管理员关联社区邮箱格式不正确');
      await getOrg(orgCode);
      const existing = await db.query(
        'SELECT id, user_id FROM organization_admins WHERE org_code = ? AND username = ? LIMIT 1',
        [orgCode, username],
      );
      const user = await ensureAdminCommunityUser(db, {
        email,
        username,
        displayName,
        orgCode,
      });
      const { salt, hash } = hashPassword(password);
      if (existing.length) {
        await db.query(
          'UPDATE organization_admins SET password_hash = ?, password_salt = ?, display_name = ?, user_id = ?, status = 1 WHERE id = ?',
          [hash, salt, displayName, Number(user.id), existing[0].id],
        );
        return res.json({
          success: true,
          id: Number(existing[0].id),
          userId: Number(user.id),
          email: user.email,
          updated: true,
        });
      }
      const result = await db.query(
        'INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        [orgCode, username, hash, salt, displayName, Number(user.id)],
      );
      res.json({ success: true, id: result.insertId, userId: Number(user.id), email: user.email, updated: false });
    }),
  );

  router.get(
    '/settings',
    authGuard,
    asyncHandler(async (req, res) => {
      requireDeveloper(req);
      const rows = await db.query('SELECT setting_key AS key, value, updated_at FROM system_settings ORDER BY setting_key');
      res.json({ list: rows.map((row) => ({ key: row.key, value: row.value, updatedAt: toIso(row.updated_at) })) });
    }),
  );

  router.put(
    '/settings/:key',
    authGuard,
    asyncHandler(async (req, res) => {
      requireDeveloper(req);
      const key = String(req.params.key || '');
      if (!/^[A-Za-z0-9_.:-]{2,64}$/.test(key)) throw new HttpError(400, '设置键名不合法');
      const value = String(req.body?.value ?? '');
      if (!value || Array.from(value).length > 255) throw new HttpError(400, '设置值不能为空且不能超过 255 字符');
      const rows = await db.query('SELECT setting_key FROM system_settings WHERE setting_key = ? LIMIT 1', [key]);
      if (rows.length) {
        await db.query('UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?', [value, key]);
      } else {
        await db.query('INSERT INTO system_settings (setting_key, value) VALUES (?, ?)', [key, value]);
      }
      res.json({ success: true, key, value });
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
    '/chat-groups',
    authGuard,
    asyncHandler(async (_req, res) => {
      const rows = await db.query(
        `SELECT g.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.group_id = g.id) AS message_count
         FROM chat_groups g ORDER BY g.sort_order, g.id`,
      );
      res.json({
        list: rows.map((row) => ({
          id: Number(row.id),
          name: row.name,
          description: row.description || '',
          sortOrder: Number(row.sort_order),
          status: Number(row.status),
          messageCount: Number(row.message_count || 0),
          createdAt: toIso(row.created_at),
        })),
      });
    }),
  );

  router.post(
    '/chat-groups',
    authGuard,
    asyncHandler(async (req, res) => {
      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim();
      if (Array.from(name).length < 2 || Array.from(name).length > 32) {
        throw new HttpError(400, '群聊名称需为 2–32 个字符');
      }
      if (Array.from(description).length > 255) throw new HttpError(400, '群聊说明不能超过 255 个字符');
      const duplicate = await db.query('SELECT id FROM chat_groups WHERE name = ? LIMIT 1', [name]);
      if (duplicate.length) throw new HttpError(409, '同名群聊已存在');
      const countRows = await db.query('SELECT COUNT(*) AS total, COALESCE(MAX(id), 0) AS max_id, COALESCE(MAX(sort_order), 0) AS max_order FROM chat_groups');
      const total = Number(countRows[0]?.total || 0);
      if (total >= 30) throw new HttpError(400, '群聊数量已达上限');
      const id = Number(countRows[0]?.max_id || 0) + 1;
      const sortOrder = Number(countRows[0]?.max_order || 0) + 1;
      await db.query(
        'INSERT INTO chat_groups (id, name, description, sort_order, status) VALUES (?, ?, ?, ?, 1)',
        [id, name, description, sortOrder],
      );
      const rows = await db.query('SELECT * FROM chat_groups WHERE id = ? LIMIT 1', [id]);
      const row = rows[0];
      res.status(201).json({
        group: {
          id: Number(row.id),
          name: row.name,
          description: row.description || '',
          sortOrder: Number(row.sort_order),
          status: Number(row.status),
          messageCount: 0,
          createdAt: toIso(row.created_at),
        },
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
