import crypto from 'node:crypto';

/** scrypt 哈希：返回 hex salt 与 hex hash */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

/** 常量时间校验密码 */
export function verifyPassword(password, salt, hash) {
  try {
    const expected = Buffer.from(String(hash), 'hex');
    const actual = crypto.scryptSync(String(password), String(salt), expected.length || 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** 常量时间比较短文本（系统管理密码） */
export function safeCompare(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
