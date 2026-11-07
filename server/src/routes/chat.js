import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { serializeChatMessage } from '../utils/serialize.js';
import { AT_ALL_LIMIT, getAtAllUsed, getWeekKey } from '../utils/atAll.js';

export function createChatRouter({ db, authGuard }) {
  const router = express.Router();

  router.get(
    '/at-all',
    authGuard,
    asyncHandler(async (req, res) => {
      const weekKey = getWeekKey();
      const used = await getAtAllUsed(db, req.userId, weekKey);
      res.json({
        limit: AT_ALL_LIMIT,
        used,
        remaining: Math.max(0, AT_ALL_LIMIT - used),
        weekStart: weekKey,
      });
    }),
  );

  router.get(
    '/history',
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 50;
      const rawBefore = Number(req.query.beforeId);
      const beforeId = Number.isSafeInteger(rawBefore) && rawBefore > 0 ? rawBefore : 0;

      const where = beforeId ? 'WHERE m.id < ? AND u.status = 1' : 'WHERE u.status = 1';
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
