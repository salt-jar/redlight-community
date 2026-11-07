import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { serializeChatMessage } from '../utils/serialize.js';

export function createChatRouter({ db, authGuard }) {
  const router = express.Router();

  router.get(
    '/groups',
    authGuard,
    asyncHandler(async (_req, res) => {
      const rows = await db.query(
        'SELECT id, name, description, sort_order FROM chat_groups WHERE status = 1 ORDER BY sort_order, id',
      );
      res.json({
        list: rows.map((row) => ({
          id: Number(row.id),
          name: row.name,
          description: row.description || '',
          sortOrder: Number(row.sort_order),
        })),
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
      const rawGroupId = Number(req.query.groupId);
      const groupId = Number.isSafeInteger(rawGroupId) && rawGroupId > 0 ? rawGroupId : 1;
      const groupRows = await db.query('SELECT id FROM chat_groups WHERE id = ? AND status = 1 LIMIT 1', [groupId]);
      if (!groupRows.length) throw new HttpError(404, '群聊不存在或已停用');

      const where = beforeId
        ? 'WHERE m.group_id = ? AND m.id < ? AND u.status = 1'
        : 'WHERE m.group_id = ? AND u.status = 1';
      const params = beforeId ? [groupId, beforeId, limit + 1] : [groupId, limit + 1];
      const rows = await db.query(
        `SELECT m.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url, u.role AS author_role,
                p.title AS proposal_title
         FROM chat_messages m JOIN users u ON u.id = m.user_id
         LEFT JOIN proposals p ON p.id = m.proposal_id
         ${where} ORDER BY m.id DESC LIMIT ?`,
        params,
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();
      res.json({ list: page.map(serializeChatMessage), hasMore, limit, groupId });
    }),
  );

  return router;
}
