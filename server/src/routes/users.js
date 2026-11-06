import express from 'express';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { serializePublicUser, serializeUser } from '../utils/serialize.js';
import { listPosts } from './posts.js';

function parseNickname(value) {
  const nickname = String(value ?? '').trim();
  const length = Array.from(nickname).length;
  if (length < 2 || length > 20) throw new HttpError(400, '昵称长度需为 2–20 个字符');
  if (/[\u0000-\u001f\u007f]/.test(nickname)) throw new HttpError(400, '昵称不能包含换行或控制字符');
  return nickname;
}

function parseAvatarUrl(value) {
  const url = value === null || value === undefined ? '' : String(value).trim();
  if (!url) return '';
  if (!/^\/uploads\/images\/[\w.\-]+$/.test(url)) {
    throw new HttpError(400, '头像地址不合法，请重新上传');
  }
  return url;
}

export function createUsersRouter({ db, optionalAuth, authGuard }) {
  const router = express.Router();

  // 修改自己的昵称 / 头像
  router.patch(
    '/me',
    authGuard,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const fields = [];
      const params = [];

      if (body.nickname !== undefined) {
        fields.push('nickname = ?');
        params.push(parseNickname(body.nickname));
      }
      if (body.avatarUrl !== undefined) {
        fields.push('avatar_url = ?');
        params.push(parseAvatarUrl(body.avatarUrl));
      }
      if (fields.length === 0) throw new HttpError(400, '请提供要修改的昵称或头像');

      await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...params, req.userId]);
      const rows = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.userId]);
      if (!rows.length) throw new HttpError(404, '用户不存在');
      res.json({ user: serializeUser(rows[0]) });
    }),
  );

  router.get(
    '/:id',
    optionalAuth,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, '用户不存在');
      const rows = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
      if (!rows.length) throw new HttpError(404, '用户不存在');
      const { page, size, offset } = parsePagination(req.query, 10, 50);
      const { list, total } = await listPosts(db, {
        where: 'WHERE p.user_id = ?',
        params: [id],
        page,
        size,
        offset,
        viewerId: req.userId,
      });
      res.json({
        user: serializePublicUser(rows[0]),
        posts: list,
        page,
        size,
        total,
        hasMore: offset + list.length < total,
      });
    }),
  );

  return router;
}
