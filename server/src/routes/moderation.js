import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';

function parseId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, `${label}不存在`);
  return id;
}

function parseStatus(value) {
  const status = Number(value);
  if (status !== 0 && status !== 1) throw new HttpError(400, '状态参数不正确');
  return status;
}

/**
 * 管理员以社区用户身份直接执行治理操作（无需进入 /org/001）。
 * 只有 users.role = 1 的管理员账号可以调用。
 */
export function createModerationRouter({ db, authGuard, cache }) {
  const router = express.Router();
  router.use(authGuard);
  router.use(
    asyncHandler(async (req, _res, next) => {
      const rows = await db.query('SELECT id, role, status FROM users WHERE id = ? LIMIT 1', [req.userId]);
      if (!rows.length || Number(rows[0].status) !== 1) throw new HttpError(401, '登录状态无效');
      if (Number(rows[0].role) !== 1) throw new HttpError(403, '只有管理员账号可以执行此操作');
      req.moderationUser = rows[0];
      next();
    }),
  );

  router.post(
    '/posts/:id/status',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '文章');
      const status = parseStatus(req.body?.status);
      const result = await db.query('UPDATE posts SET status = ? WHERE id = ?', [status, id]);
      if (!result.affectedRows) throw new HttpError(404, '文章不存在');
      await cache.del('stats:hot-topics');
      res.json({ success: true, id, status });
    }),
  );

  router.post(
    '/books/:id/status',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '图书');
      const status = parseStatus(req.body?.status);
      const result = await db.query('UPDATE books SET status = ? WHERE id = ?', [status, id]);
      if (!result.affectedRows) throw new HttpError(404, '图书不存在');
      res.json({ success: true, id, status });
    }),
  );

  router.post(
    '/users/:id/status',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id, '用户');
      const status = parseStatus(req.body?.status);
      if (id === Number(req.moderationUser.id) && status === 0) {
        throw new HttpError(400, '不能封锁当前管理员自己');
      }
      const rows = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [id]);
      if (!rows.length) throw new HttpError(404, '用户不存在');
      await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
      res.json({ success: true, id, status });
    }),
  );

  return router;
}
