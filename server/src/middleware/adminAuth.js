import jwt from 'jsonwebtoken';

/**
 * 管理端 JWT 守卫：
 * - scope=org：校验组织管理员账号、组织状态；
 * - scope=sql：SQL 开发者系统，权限更高，无需个人账号。
 */
export function createAdminGuard(config, db) {
  return async function adminGuard(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ msg: '管理员未登录' });

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.type !== 'admin') {
        return res.status(401).json({ msg: '管理员登录无效' });
      }

      if (payload.scope === 'sql') {
        req.isDeveloper = true;
        req.adminId = 0;
        req.orgCode = null;
        return next();
      }

      if (payload.scope !== 'org' || !payload.adminId || !payload.orgCode) {
        return res.status(401).json({ msg: '管理员登录无效' });
      }
      const rows = await db.query(
        `SELECT a.id, a.org_code, a.status AS admin_status, o.status AS org_status
         FROM organization_admins a
         LEFT JOIN organizations o ON o.code = a.org_code
         WHERE a.id = ? AND a.org_code = ? LIMIT 1`,
        [payload.adminId, payload.orgCode],
      );
      if (
        !rows.length ||
        Number(rows[0].admin_status) !== 1 ||
        Number(rows[0].org_status) !== 1
      ) {
        return res.status(401).json({ msg: '管理员账号或组织已被停用' });
      }
      req.isDeveloper = false;
      req.adminId = Number(rows[0].id);
      req.orgCode = rows[0].org_code;
      return next();
    } catch {
      return res.status(401).json({ msg: '管理员登录已过期，请重新登录' });
    }
  };
}
