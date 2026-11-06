import express from 'express';
import cors from 'cors';
import { createAuthGuard, createOptionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundApi } from './middleware/error.js';
import { createAuthRouter } from './routes/auth.js';
import { createBooksRouter } from './routes/books.js';
import { createChatRouter } from './routes/chat.js';
import { createPostsRouter } from './routes/posts.js';
import { createSearchRouter } from './routes/search.js';
import { createStatsRouter } from './routes/stats.js';
import { createUploadRouter } from './routes/upload.js';
import { createUsersRouter } from './routes/users.js';

/**
 * 构造 Express 应用。依赖（db/cache/mailer/online/config）由 bootstrap 注入，
 * 便于测试时使用独立的 SQLite 文件与上传目录。
 */
export function createApp(deps) {
  const { config } = deps;
  const app = express();

  if (config.trustProxy) app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((item) => item.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, driver: deps.db.driver });
  });

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', fallthrough: true }));

  const authGuard = createAuthGuard(config);
  const optionalAuth = createOptionalAuth(config);

  app.use('/api/auth', createAuthRouter({ ...deps, authGuard, optionalAuth }));
  app.use('/api/posts', createPostsRouter({ ...deps, authGuard, optionalAuth }));
  app.use('/api/upload', createUploadRouter({ ...deps, authGuard }));
  app.use('/api/books', createBooksRouter({ ...deps, authGuard }));
  app.use('/api/search', createSearchRouter(deps));
  app.use('/api/chat', createChatRouter(deps));
  app.use('/api/users', createUsersRouter({ ...deps, authGuard, optionalAuth }));
  app.use('/api/stats', createStatsRouter(deps));

  app.use('/api', notFoundApi);
  app.use(errorHandler);

  app.locals.deps = deps;
  return app;
}
