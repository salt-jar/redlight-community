import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { toIso } from '../utils/serialize.js';

function serializeProposal(row) {
  return {
    id: Number(row.id),
    title: row.title || '',
    proposalTime: row.proposal_time || '',
    proposerInfo: row.proposer_info || '',
    content: row.content || '',
    createdAt: toIso(row.created_at),
    user: {
      id: Number(row.user_id),
      nickname: row.author_nickname || '未知用户',
      username: row.author_username || '',
      communityNo: row.author_community_no || '',
      avatarUrl: row.author_avatar_url || '',
      bio: row.author_bio || '',
    },
  };
}

const PROPOSAL_SELECT = `SELECT p.*, u.nickname AS author_nickname, u.username AS author_username,
  u.community_no AS author_community_no, u.avatar_url AS author_avatar_url, u.bio AS author_bio
  FROM proposals p JOIN users u ON u.id = p.user_id`;

export function createProposalsRouter({ db, authGuard }) {
  const router = express.Router();

  router.get(
    '/',
    authGuard,
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 50;
      const rows = await db.query(
        `${PROPOSAL_SELECT} WHERE u.status = 1 ORDER BY p.id DESC LIMIT ?`,
        [limit],
      );
      res.json({ list: rows.map(serializeProposal) });
    }),
  );

  router.get(
    '/:id',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, '提案不存在');
      const rows = await db.query(`${PROPOSAL_SELECT} WHERE p.id = ? AND u.status = 1 LIMIT 1`, [id]);
      if (!rows.length) throw new HttpError(404, '提案不存在');
      res.json({ proposal: serializeProposal(rows[0]) });
    }),
  );

  router.post(
    '/',
    authGuard,
    asyncHandler(async (req, res) => {
      const title = String(req.body?.title || '').trim();
      const proposalTime = String(req.body?.proposalTime || '').trim();
      const proposerInfo = String(req.body?.proposerInfo || '').trim();
      const content = String(req.body?.content || '').trim();

      const titleLength = Array.from(title).length;
      if (titleLength < 2 || titleLength > 120) throw new HttpError(400, '提案标题需为 2–120 个字符');
      if (!proposalTime || Array.from(proposalTime).length > 64) throw new HttpError(400, '请填写正确的提案时间');
      const infoLength = Array.from(proposerInfo).length;
      if (infoLength < 2 || infoLength > 255) throw new HttpError(400, '请填写发起人信息（2–255 个字符）');
      const contentLength = Array.from(content).length;
      if (contentLength < 10) throw new HttpError(400, '提案正文至少 10 个字符');
      if (contentLength > 5000) throw new HttpError(400, '提案正文不能超过 5000 个字符');

      const result = await db.query(
        'INSERT INTO proposals (user_id, title, proposal_time, proposer_info, content) VALUES (?, ?, ?, ?, ?)',
        [req.userId, title, proposalTime, proposerInfo, content],
      );
      const rows = await db.query(`${PROPOSAL_SELECT} WHERE p.id = ? LIMIT 1`, [result.insertId]);
      res.status(201).json({ proposal: serializeProposal(rows[0]) });
    }),
  );

  return router;
}
