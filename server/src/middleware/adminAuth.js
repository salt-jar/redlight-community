import jwt from 'jsonwebtoken';

/**
 * 管理员 JWT 守卫：校验 admin token，并回查门店管理员状态。
 * 被停用的管理员 / 门店不能继续访问后台。
 */
export function createAdminGuard(config, db) {
  return async function adminGuard(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ msg: '管理员未登录' });

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.type !== 'admin' || !payload.adminId) {
        return res.status(401).json({ msg: '管理员登录无效' });
      }
      const rows = await db.query(
        'SELECT id, store_id, status FROM store_admins WHERE id = ? AND status = 1 LIMIT 1',
        [payload.adminId],
      );
      if (!rows.length || Number(rows[0].store_id) !== Number(payload.storeId)) {
        return res.status(401).json({ msg: '管理员账号已被停用' });
      }
      req.adminId = Number(rows[0].id);
      req.storeId = Number(rows[0].store_id);
      return next();
    } catch {
      return res.status(401).json({ msg: '管理员登录已过期，请重新登录' });
    }
  };
}
