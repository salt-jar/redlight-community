import jwt from 'jsonwebtoken';
import { forbidden, unauthorized } from '../utils/errors.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

/** 必须登录：校验 JWT，回查用户状态，把 userId 挂到 req 上 */
export function createAuthGuard(config, db) {
  return async function authGuard(req, _res, next) {
    const token = readBearer(req);
    if (!token) return next(unauthorized());
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      return next(unauthorized());
    }
    if (!payload || !payload.userId) return next(unauthorized());

    try {
      const rows = await db.query('SELECT status FROM users WHERE id = ? LIMIT 1', [Number(payload.userId)]);
      if (!rows.length) return next(unauthorized('账号不存在或已被注销'));
      if (Number(rows[0].status) === 0) return next(forbidden('账号已被封禁，请联系管理员'));
      req.userId = Number(payload.userId);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/** 可选登录：有合法 token 时填充 req.userId，否则匿名继续 */
export function createOptionalAuth(config) {
  return function optionalAuth(req, _res, next) {
    const token = readBearer(req);
    if (!token) return next();
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload?.userId) req.userId = Number(payload.userId);
    } catch {
      // 匿名访问，忽略非法 token
    }
    return next();
  };
}
