import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { toIso, serializeChatMessage } from '../utils/serialize.js';

function serializeProposal(row, { voted = false } = {}) {
  return {
    id: Number(row.id),
    title: row.title || '',
    proposalTime: row.proposal_time || '',
    proposerInfo: row.proposer_info || '',
    content: row.content || '',
    createdAt: toIso(row.created_at),
    voteCount: Number(row.vote_count || 0),
    commentCount: Number(row.comment_count || 0),
    voted: Boolean(voted),
    user: {
      id: Number(row.user_id),
      nickname: row.author_nickname || '未知用户',
      username: row.author_username || '',
      communityNo: row.author_community_no || '',
      avatarUrl: row.author_avatar_url || '',
      bio: row.author_bio || '',
      isAdmin: Number(row.author_role) === 1,
    },
  };
}

function serializeProposalComment(row) {
  return {
    id: Number(row.id),
    proposalId: Number(row.proposal_id),
    groupId: Number(row.group_id),
    chatMessageId: row.chat_message_id ? Number(row.chat_message_id) : null,
    content: row.content || '',
    createdAt: toIso(row.created_at),
    user: {
      id: Number(row.user_id),
      nickname: row.author_nickname || '未知用户',
      username: row.author_username || '',
      avatarUrl: row.author_avatar_url || '',
      isAdmin: Number(row.author_role) === 1,
    },
  };
}

const PROPOSAL_SELECT = `SELECT p.*, u.nickname AS author_nickname, u.username AS author_username,
  u.community_no AS author_community_no, u.avatar_url AS author_avatar_url, u.bio AS author_bio,
  u.role AS author_role,
  (SELECT COUNT(*) FROM proposal_votes v WHERE v.proposal_id = p.id) AS vote_count,
  (SELECT COUNT(*) FROM proposal_comments c WHERE c.proposal_id = p.id) AS comment_count
  FROM proposals p JOIN users u ON u.id = p.user_id`;

const COMMENT_SELECT = `SELECT c.*, u.nickname AS author_nickname, u.username AS author_username,
  u.avatar_url AS author_avatar_url, u.role AS author_role
  FROM proposal_comments c JOIN users u ON u.id = c.user_id`;

async function loadProposal(db, id) {
  const rows = await db.query(`${PROPOSAL_SELECT} WHERE p.id = ? AND u.status = 1 LIMIT 1`, [id]);
  return rows[0] || null;
}

export function createProposalsRouter({ db, authGuard, chatEvents }) {
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
      res.json({ list: rows.map((row) => serializeProposal(row)) });
    }),
  );

  router.get(
    '/:id',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, '提案不存在');
      const row = await loadProposal(db, id);
      if (!row) throw new HttpError(404, '提案不存在');
      const votes = await db.query(
        'SELECT id FROM proposal_votes WHERE proposal_id = ? AND user_id = ? LIMIT 1',
        [id, req.userId],
      );
      res.json({ proposal: serializeProposal(row, { voted: votes.length > 0 }) });
    }),
  );

  router.get(
    '/:id/comments',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const proposal = await loadProposal(db, id);
      if (!proposal) throw new HttpError(404, '提案不存在');
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 100;
      const rows = await db.query(
        `${COMMENT_SELECT} WHERE c.proposal_id = ? ORDER BY c.id ASC LIMIT ?`,
        [id, limit],
      );
      res.json({ list: rows.map(serializeProposalComment), limit });
    }),
  );

  router.post(
    '/:id/comments',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const proposal = await loadProposal(db, id);
      if (!proposal) throw new HttpError(404, '提案不存在');
      const rawGroupId = Number(req.body?.groupId);
      const groupId = Number.isSafeInteger(rawGroupId) && rawGroupId > 0 ? rawGroupId : 1;
      const groupRows = await db.query('SELECT id FROM chat_groups WHERE id = ? AND status = 1 LIMIT 1', [groupId]);
      if (!groupRows.length) throw new HttpError(404, '群聊不存在或已停用');
      const content = String(req.body?.content || '').trim();
      if (!content) throw new HttpError(400, '讨论内容不能为空');
      const length = Array.from(content).length;
      if (length > 2000) throw new HttpError(400, '提案讨论单条不能超过 2000 字');

      const commentResult = await db.query(
        'INSERT INTO proposal_comments (proposal_id, user_id, group_id, content) VALUES (?, ?, ?, ?)',
        [id, req.userId, groupId, content],
      );
      const messageResult = await db.query(
        'INSERT INTO chat_messages (group_id, user_id, type, content, proposal_id) VALUES (?, ?, 1, ?, ?)',
        [groupId, req.userId, content, id],
      );
      await db.query('UPDATE proposal_comments SET chat_message_id = ? WHERE id = ?', [
        messageResult.insertId,
        commentResult.insertId,
      ]);

      const commentRows = await db.query(`${COMMENT_SELECT} WHERE c.id = ? LIMIT 1`, [commentResult.insertId]);
      const messageRows = await db.query(
        `SELECT m.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url, u.role AS author_role,
                p.title AS proposal_title
         FROM chat_messages m JOIN users u ON u.id = m.user_id
         LEFT JOIN proposals p ON p.id = m.proposal_id
         WHERE m.id = ? LIMIT 1`,
        [messageResult.insertId],
      );
      const message = serializeChatMessage(messageRows[0]);
      chatEvents?.emit?.('chat:message', { groupId, message });

      const updated = await loadProposal(db, id);
      res.status(201).json({
        comment: serializeProposalComment(commentRows[0]),
        message,
        proposal: serializeProposal(updated),
      });
    }),
  );

  router.post(
    '/:id/vote',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const proposal = await loadProposal(db, id);
      if (!proposal) throw new HttpError(404, '提案不存在');
      const existing = await db.query(
        'SELECT id FROM proposal_votes WHERE proposal_id = ? AND user_id = ? LIMIT 1',
        [id, req.userId],
      );
      let voted;
      if (existing.length) {
        await db.query('DELETE FROM proposal_votes WHERE proposal_id = ? AND user_id = ?', [id, req.userId]);
        voted = false;
      } else {
        await db.query('INSERT INTO proposal_votes (proposal_id, user_id) VALUES (?, ?)', [id, req.userId]);
        voted = true;
      }
      const countRows = await db.query('SELECT COUNT(*) AS total FROM proposal_votes WHERE proposal_id = ?', [id]);
      res.json({ success: true, voted, voteCount: Number(countRows[0]?.total || 0) });
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
      const row = await loadProposal(db, result.insertId);
      res.status(201).json({ proposal: serializeProposal(row) });
    }),
  );

  return router;
}
