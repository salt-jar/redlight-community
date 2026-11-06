import express from 'express';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { serializePublicUser } from '../utils/serialize.js';
import { listPosts } from './posts.js';

export function createUsersRouter({ db, optionalAuth }) {
  const router = express.Router();

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
