import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { serializeChatMessage } from '../utils/serialize.js';

export function createChatRouter({ db }) {
  const router = express.Router();

  router.get(
    '/history',
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 50;
      const rawBefore = Number(req.query.beforeId);
      const beforeId = Number.isSafeInteger(rawBefore) && rawBefore > 0 ? rawBefore : 0;

      const where = beforeId ? 'WHERE m.id < ?' : '';
      const params = beforeId ? [beforeId, limit + 1] : [limit + 1];
      const rows = await db.query(
        `SELECT m.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url
         FROM chat_messages m JOIN users u ON u.id = m.user_id
         ${where} ORDER BY m.id DESC LIMIT ?`,
        params,
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();
      res.json({ list: page.map(serializeChatMessage), hasMore, limit });
    }),
  );

  return router;
}
