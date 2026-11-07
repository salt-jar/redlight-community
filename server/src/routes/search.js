import express from 'express';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { serializeBook, serializePublicUser } from '../utils/serialize.js';

const BOOK_FIELDS = 'id, uploader_id, title, author, category, description, cover_url, file_format, file_size, download_count, status, created_at';

function likeParam(q) {
  return `%${q}%`;
}

function bookFilter(db, q, category) {
  const where = [
    'status = 1',
    'EXISTS (SELECT 1 FROM users bu WHERE bu.id = books.uploader_id AND bu.status = 1)',
  ];
  const params = [];
  if (q) {
    if (db.driver === 'mysql') {
      where.push('MATCH(title, author, description) AGAINST (? IN NATURAL LANGUAGE MODE)');
      params.push(q);
    } else {
      where.push('(title LIKE ? OR author LIKE ? OR description LIKE ?)');
      const like = likeParam(q);
      params.push(like, like, like);
    }
  }
  if (category && category !== '全部') {
    where.push('category = ?');
    params.push(category);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

export function createSearchRouter({ db }) {
  const router = express.Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ books: [], users: [] });
      const { whereSql, params } = bookFilter(db, q, '');
      const books = await db.query(
        `SELECT ${BOOK_FIELDS} FROM books ${whereSql} ORDER BY download_count DESC, id DESC LIMIT 5`,
        params,
      );
      const like = likeParam(q);
      const users = await db.query(
        `SELECT id, nickname, username, community_no, avatar_url, bio, created_at FROM users
         WHERE status = 1 AND (nickname LIKE ? OR email LIKE ? OR username LIKE ? OR community_no LIKE ?)
         ORDER BY id DESC LIMIT 5`,
        [like, like, like, like],
      );
      return res.json({ books: books.map(serializeBook), users: users.map((row) => serializePublicUser(row)) });
    }),
  );

  router.get(
    '/books',
    asyncHandler(async (req, res) => {
      const q = String(req.query.q || '').trim();
      const category = String(req.query.category || '').trim();
      const { page, size, offset } = parsePagination(req.query, 20, 50);
      const { whereSql, params } = bookFilter(db, q, category);
      const rows = await db.query(
        `SELECT ${BOOK_FIELDS} FROM books ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, Number(size), Number(offset)],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM books ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      res.json({ list: rows.map(serializeBook), page, size, total, hasMore: offset + rows.length < total });
    }),
  );

  router.get(
    '/users',
    asyncHandler(async (req, res) => {
      const q = String(req.query.q || '').trim();
      const { page, size, offset } = parsePagination(req.query, 20, 50);
      const params = [];
      let whereSql = 'WHERE status = 1';
      if (q) {
        whereSql = 'WHERE status = 1 AND (nickname LIKE ? OR email LIKE ? OR username LIKE ? OR community_no LIKE ?)';
        const like = likeParam(q);
        params.push(like, like, like, like);
      }
      const rows = await db.query(
        `SELECT id, nickname, username, community_no, avatar_url, bio, created_at FROM users ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, Number(size), Number(offset)],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      res.json({ list: rows.map((row) => serializePublicUser(row)), page, size, total, hasMore: offset + rows.length < total });
    }),
  );

  return router;
}
