import jwt from 'jsonwebtoken';
import { unauthorized } from '../utils/errors.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

/** 必须登录：校验 JWT，把 userId 挂到 req 上 */
export function createAuthGuard(config) {
  return function authGuard(req, _res, next) {
    const token = readBearer(req);
    if (!token) return next(unauthorized());
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (!payload || !payload.userId) return next(unauthorized());
      req.userId = Number(payload.userId);
      return next();
    } catch {
      return next(unauthorized());
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
