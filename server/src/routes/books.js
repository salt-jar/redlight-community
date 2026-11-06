import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';
import { serializeBook } from '../utils/serialize.js';
import { extractBookArchive, removeDirQuietly } from '../services/archive.js';
import { extractCover } from '../services/cover.js';

const BOOK_SELECT = `SELECT b.*, u.nickname AS uploader_nickname, u.avatar_url AS uploader_avatar_url
  FROM books b JOIN users u ON u.id = b.uploader_id`;

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, '图书不存在');
  return id;
}

function resolveBookFile(config, book) {
  const absolute = path.resolve(config.appRoot, book.file_path);
  const root = path.resolve(config.uploadDir) + path.sep;
  if (!absolute.startsWith(root)) throw new HttpError(403, '非法的文件路径');
  if (!fs.existsSync(absolute)) throw new HttpError(404, '图书文件不存在，可能已被清理');
  return absolute;
}

function contentDisposition(type, filename) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function createBooksRouter({ db, config, authGuard }) {
  const router = express.Router();

  const zipUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, config.tempDir),
      filename: (_req, _file, callback) => callback(null, `${Date.now()}-${crypto.randomUUID()}.zip`),
    }),
    limits: { fileSize: config.limits.zipSize, files: 1 },
    fileFilter(_req, file, callback) {
      if (!/\.zip$/i.test(file.originalname || '')) {
        callback(new HttpError(400, '只支持上传 .zip 格式的图书压缩包'));
        return;
      }
      callback(null, true);
    },
  });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, size, offset } = parsePagination(req.query, 12, 50);
      const category = String(req.query.category || '').trim();
      const where = ['b.status = 1'];
      const params = [];
      if (category && category !== '全部') {
        where.push('b.category = ?');
        params.push(category);
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;
      const rows = await db.query(
        `${BOOK_SELECT} ${whereSql} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
        [...params, Number(size), Number(offset)],
      );
      const countRows = await db.query(`SELECT COUNT(*) AS total FROM books b ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);
      res.json({ list: rows.map(serializeBook), page, size, total, hasMore: offset + rows.length < total });
    }),
  );

  router.post(
    '/upload',
    authGuard,
    zipUpload.single('zipFile'),
    asyncHandler(async (req, res) => {
      if (!req.file?.path) throw new HttpError(400, '请选择要上传的 ZIP 图书压缩包');
      const zipPath = req.file.path;
      const bookId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const extractDir = path.join(config.booksDir, bookId);
      const publicPrefix = `/uploads/books/${bookId}`;

      try {
        const title = String(req.body?.title ?? '').trim();
        const author = String(req.body?.author ?? '').trim();
        const category = String(req.body?.category ?? '').trim();
        const description = String(req.body?.description ?? '').trim();

        if (!title) throw new HttpError(400, '请填写书名');
        if (Array.from(title).length > 255) throw new HttpError(400, '书名不能超过 255 个字符');
        if (Array.from(author).length > 128) throw new HttpError(400, '作者不能超过 128 个字符');
        if (Array.from(category).length > 64) throw new HttpError(400, '分类不能超过 64 个字符');
        if (Array.from(description).length > 2000) throw new HttpError(400, '简介不能超过 2000 个字符');
        if (category && !config.bookCategories.includes(category)) {
          throw new HttpError(400, `分类不在允许范围内：${config.bookCategories.join(' / ')}`);
        }

        const archive = extractBookArchive({ zipPath, extractDir, config });
        const coverUrl = await extractCover({
          format: archive.format,
          filePath: archive.bookFile,
          outDir: extractDir,
          publicPrefix,
          config,
        });
        const relativePath = path.relative(config.appRoot, archive.bookFile).split(path.sep).join('/');
        const fileSize = fs.statSync(archive.bookFile).size;
        const result = await db.query(
          `INSERT INTO books (uploader_id, title, author, category, description, cover_url, file_path, file_format, file_size, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [req.userId, title, author, category, description, coverUrl, relativePath, archive.format, fileSize],
        );
        const rows = await db.query(`${BOOK_SELECT} WHERE b.id = ? LIMIT 1`, [result.insertId]);
        res.json({ success: true, msg: '图书上架成功', book: serializeBook(rows[0]) });
      } catch (error) {
        removeDirQuietly(extractDir);
        throw error;
      } finally {
        try {
          fs.unlinkSync(zipPath);
        } catch {
          // 临时 ZIP 已被清理
        }
      }
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const rows = await db.query(`${BOOK_SELECT} WHERE b.id = ? AND b.status = 1 LIMIT 1`, [id]);
      if (!rows.length) throw new HttpError(404, '图书不存在或尚未上架');
      res.json({ book: serializeBook(rows[0]) });
    }),
  );

  router.get(
    '/:id/file',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const rows = await db.query('SELECT * FROM books WHERE id = ? AND status = 1 LIMIT 1', [id]);
      if (!rows.length) throw new HttpError(404, '图书不存在或尚未上架');
      const book = rows[0];
      const absolute = resolveBookFile(config, book);
      res.setHeader('Content-Type', book.file_format === 'epub' ? 'application/epub+zip' : 'application/pdf');
      res.setHeader('Content-Disposition', contentDisposition('inline', `${book.title}.${book.file_format}`));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(absolute);
    }),
  );

  router.get(
    '/:id/download',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const rows = await db.query('SELECT * FROM books WHERE id = ? AND status = 1 LIMIT 1', [id]);
      if (!rows.length) throw new HttpError(404, '图书不存在或尚未上架');
      const book = rows[0];
      const absolute = resolveBookFile(config, book);
      await db.query('UPDATE books SET download_count = download_count + 1 WHERE id = ?', [id]);
      res.download(absolute, `${book.title}.${book.file_format}`, (error) => {
        if (error && !res.headersSent) res.status(500).json({ msg: '下载失败，请稍后重试' });
      });
    }),
  );

  return router;
}
