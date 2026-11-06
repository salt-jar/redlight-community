import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export function createUploadRouter({ config, authGuard }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.limits.imageSize, files: 1 },
    fileFilter(_req, file, callback) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!MIME_EXT[file.mimetype] && !allowed.includes(ext)) {
        callback(new HttpError(400, '仅支持 JPG / PNG / GIF / WebP 格式的图片'));
        return;
      }
      callback(null, true);
    },
  });

  router.post(
    '/image',
    authGuard,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file?.buffer?.length) throw new HttpError(400, '请选择要上传的图片');
      const ext = MIME_EXT[req.file.mimetype] || (path.extname(req.file.originalname || '').toLowerCase() || '.jpg');
      const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
      fs.writeFileSync(path.join(config.imagesDir, filename), req.file.buffer);
      res.json({ url: `/uploads/images/${filename}`, size: req.file.size });
    }),
  );

  return router;
}
