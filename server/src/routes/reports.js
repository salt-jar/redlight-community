import express from 'express';
import { asyncHandler } from '../utils/http.js';
import { HttpError } from '../utils/errors.js';

export const REPORT_REASONS = ['违法违规', '色情低俗', '侵权盗版', '垃圾广告', '人身攻击', '其他'];

export function createReportsRouter({ db, authGuard }) {
  const router = express.Router();

  router.post(
    '/',
    authGuard,
    asyncHandler(async (req, res) => {
      const targetType = String(req.body?.targetType || '').trim();
      const targetId = Number(req.body?.targetId);
      const reason = String(req.body?.reason || '').trim();
      const detail = String(req.body?.detail || '').trim();

      if (!['post', 'book'].includes(targetType)) throw new HttpError(400, '举报对象类型不正确');
      if (!Number.isSafeInteger(targetId) || targetId <= 0) throw new HttpError(400, '举报对象不正确');
      if (!REPORT_REASONS.includes(reason)) throw new HttpError(400, '请选择举报原因');
      if (Array.from(detail).length > 500) throw new HttpError(400, '补充说明不能超过 500 个字符');

      const table = targetType === 'post' ? 'posts' : 'books';
      const targetRows = await db.query(`SELECT id FROM ${table} WHERE id = ? AND status = 1 LIMIT 1`, [targetId]);
      if (!targetRows.length) throw new HttpError(404, '举报对象不存在或已被下架');

      const duplicate = await db.query(
        'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 0 LIMIT 1',
        [req.userId, targetType, targetId],
      );
      if (duplicate.length) throw new HttpError(409, '你已经举报过该内容，请等待处理');

      const result = await db.query(
        'INSERT INTO reports (reporter_id, target_type, target_id, reason, detail) VALUES (?, ?, ?, ?, ?)',
        [req.userId, targetType, targetId, reason, detail],
      );
      res.status(201).json({ success: true, id: result.insertId, msg: '举报已提交，管理员会尽快处理' });
    }),
  );

  return router;
}
