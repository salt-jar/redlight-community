import express from 'express';
import { asyncHandler } from '../utils/http.js';

const HOT_TOPIC_TTL = 60;

function extractTopics(content) {
  const topics = [];
  const regex = /#([^#\s]{1,30})#/gu;
  let match;
  while ((match = regex.exec(content || '')) !== null) {
    topics.push(match[1].trim());
  }
  return topics;
}

export function createStatsRouter({ db, cache, online }) {
  const router = express.Router();

  router.get(
    '/hot-topics',
    asyncHandler(async (_req, res) => {
      const cacheKey = 'stats:hot-topics';
      const cached = await cache.get(cacheKey);
      if (cached) {
        try {
          return res.json({ list: JSON.parse(cached), cached: true });
        } catch {
          // 缓存损坏时重建
        }
      }
      const rows = await db.query('SELECT content FROM posts ORDER BY id DESC LIMIT 500');
      const counts = new Map();
      for (const row of rows) {
        for (const topic of extractTopics(row.content)) {
          counts.set(topic, (counts.get(topic) || 0) + 1);
        }
      }
      const list = [...counts.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
        .slice(0, 5);
      await cache.set(cacheKey, JSON.stringify(list), HOT_TOPIC_TTL);
      return res.json({ list, cached: false });
    }),
  );

  router.get(
    '/community',
    asyncHandler(async (_req, res) => {
      const today = db.driver === 'mysql' ? 'DATE(created_at) = CURDATE()' : "date(created_at, 'localtime') = date('now', 'localtime')";
      const [users, todayNewUsers, todayPosts, books] = await Promise.all([
        db.query('SELECT COUNT(*) AS total FROM users'),
        db.query(`SELECT COUNT(*) AS total FROM users WHERE ${today}`),
        db.query(`SELECT COUNT(*) AS total FROM posts WHERE ${today}`),
        db.query('SELECT COUNT(*) AS total FROM books WHERE status = 1'),
      ]);
      res.json({
        users: Number(users[0]?.total || 0),
        todayNewUsers: Number(todayNewUsers[0]?.total || 0),
        todayPosts: Number(todayPosts[0]?.total || 0),
        books: Number(books[0]?.total || 0),
      });
    }),
  );

  router.get('/online', (_req, res) => {
    res.json(online.snapshot());
  });

  return router;
}

export { extractTopics };
