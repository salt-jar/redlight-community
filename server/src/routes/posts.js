import express from 'express';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { serializeComment, serializePost } from '../utils/serialize.js';

const POST_SELECT = `SELECT p.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url, u.bio AS author_bio
  FROM posts p JOIN users u ON u.id = p.user_id`;

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, '帖子不存在');
  return id;
}

function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

async function attachMeta(db, rows, viewerId) {
  if (!rows.length) return { likedIds: new Set(), reposts: new Map() };
  const likedIds = new Set();
  if (viewerId) {
    const ids = rows.map((row) => Number(row.id));
    const likes = await db.query(
      `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders(ids.length)})`,
      [viewerId, ...ids],
    );
    for (const like of likes) likedIds.add(Number(like.post_id));
  }

  const reposts = new Map();
  const repostIds = [...new Set(rows.map((row) => Number(row.repost_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (repostIds.length) {
    const originals = await db.query(
      `${POST_SELECT} WHERE p.id IN (${placeholders(repostIds.length)})`,
      repostIds,
    );
    for (const original of originals) reposts.set(Number(original.id), original);
  }
  return { likedIds, reposts };
}

async function listPosts(db, { where = '', params = [], page, size, offset, viewerId }) {
  const rows = await db.query(
    `${POST_SELECT} ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(size), Number(offset)],
  );
  const countRows = await db.query(`SELECT COUNT(*) AS total FROM posts p ${where}`, params);
  const total = Number(countRows[0]?.total || 0);
  const { likedIds, reposts } = await attachMeta(db, rows, viewerId);
  return {
    list: rows.map((row) => serializePost(row, {
      liked: likedIds.has(Number(row.id)),
      repost: reposts.get(Number(row.repost_id)) || null,
    })),
    total,
  };
}

async function getPostRow(db, id) {
  const rows = await db.query(`${POST_SELECT} WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export function createPostsRouter({ db, config, cache, authGuard, optionalAuth }) {
  const router = express.Router();

  router.get(
    '/',
    optionalAuth,
    asyncHandler(async (req, res) => {
      const { page, size, offset } = parsePagination(req.query, 20, 50);
      const { list, total } = await listPosts(db, { page, size, offset, viewerId: req.userId });
      res.json({ list, page, size, total, hasMore: offset + list.length < total });
    }),
  );

  router.post(
    '/',
    authGuard,
    asyncHandler(async (req, res) => {
      const content = String(req.body?.content ?? '').trim();
      const images = req.body?.images === undefined ? [] : req.body.images;
      const length = Array.from(content).length;
      if (length === 0) throw new HttpError(400, '说点什么再发布吧');
      if (length > config.maxPostContent) throw new HttpError(400, `正文不能超过 ${config.maxPostContent} 字`);
      if (!Array.isArray(images)) throw new HttpError(400, '配图格式不正确');
      if (images.length > config.maxPostImages) throw new HttpError(400, `最多上传 ${config.maxPostImages} 张图片`);
      for (const image of images) {
        if (typeof image !== 'string' || !/^\/uploads\/images\/[\w.\-]+$/.test(image)) {
          throw new HttpError(400, '配图地址不合法，请重新上传');
        }
      }

      const result = await db.query('INSERT INTO posts (user_id, content, images) VALUES (?, ?, ?)', [
        req.userId,
        content,
        JSON.stringify(images),
      ]);
      await cache.del('stats:hot-topics');
      const row = await getPostRow(db, result.insertId);
      res.json({ post: serializePost(row) });
    }),
  );

  router.get(
    '/:id',
    optionalAuth,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const row = await getPostRow(db, id);
      if (!row) throw new HttpError(404, '帖子不存在或已删除');
      const { likedIds, reposts } = await attachMeta(db, [row], req.userId);
      res.json({
        post: serializePost(row, { liked: likedIds.has(id), repost: reposts.get(Number(row.repost_id)) || null }),
      });
    }),
  );

  router.post(
    '/:id/like',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const rows = await db.query('SELECT id FROM posts WHERE id = ? LIMIT 1', [id]);
      if (!rows.length) throw new HttpError(404, '帖子不存在或已删除');

      const existing = await db.query('SELECT id FROM likes WHERE user_id = ? AND post_id = ? LIMIT 1', [req.userId, id]);
      let liked;
      if (existing.length) {
        await db.query('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [req.userId, id]);
        liked = false;
      } else {
        await db.query('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [req.userId, id]);
        liked = true;
      }
      // 以点赞表真实行数回写，避免并发下计数漂移
      await db.query(
        'UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes WHERE post_id = ?) WHERE id = ?',
        [id, id],
      );
      const counts = await db.query('SELECT like_count FROM posts WHERE id = ?', [id]);
      res.json({ liked, likeCount: Number(counts[0]?.like_count || 0) });
    }),
  );

  async function listComments(req, res) {
    const id = parseId(req.params.id);
    const posts = await db.query('SELECT id FROM posts WHERE id = ? LIMIT 1', [id]);
    if (!posts.length) throw new HttpError(404, '帖子不存在或已删除');
    const rows = await db.query(
      `SELECT c.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 500`,
      [id],
    );
    res.json({ list: rows.map(serializeComment), total: rows.length });
  }

  router.get('/:id/comments', optionalAuth, asyncHandler(listComments));

  async function createComment(req, res) {
    const id = parseId(req.params.id);
    const content = String(req.body?.content ?? '').trim();
    const length = Array.from(content).length;
    if (length === 0) throw new HttpError(400, '评论内容不能为空');
    if (length > config.maxCommentContent) throw new HttpError(400, `评论不能超过 ${config.maxCommentContent} 字`);

    const posts = await db.query('SELECT id FROM posts WHERE id = ? LIMIT 1', [id]);
    if (!posts.length) throw new HttpError(404, '帖子不存在或已删除');

    const result = await db.query('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)', [id, req.userId, content]);
    await db.query(
      'UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?',
      [id, id],
    );
    const rows = await db.query(
      `SELECT c.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ? LIMIT 1`,
      [result.insertId],
    );
    const counts = await db.query('SELECT comment_count FROM posts WHERE id = ?', [id]);
    res.json({ comment: serializeComment(rows[0]), commentCount: Number(counts[0]?.comment_count || 0) });
  }

  router.post('/:id/comments', authGuard, asyncHandler(createComment));
  router.post('/:id/comment', authGuard, asyncHandler(createComment));

  router.post(
    '/:id/repost',
    authGuard,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const original = await getPostRow(db, id);
      if (!original) throw new HttpError(404, '原帖不存在或已删除');
      const content = String(req.body?.content ?? '').trim();
      if (Array.from(content).length > config.maxPostContent) {
        throw new HttpError(400, `转发评论不能超过 ${config.maxPostContent} 字`);
      }
      const result = await db.query('INSERT INTO posts (user_id, content, images, repost_id) VALUES (?, ?, ?, ?)', [
        req.userId,
        content,
        JSON.stringify([]),
        id,
      ]);
      await cache.del('stats:hot-topics');
      const row = await getPostRow(db, result.insertId);
      res.json({ post: serializePost(row, { repost: original }) });
    }),
  );

  return router;
}

export { listPosts };
