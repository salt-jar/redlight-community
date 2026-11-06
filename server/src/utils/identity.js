import crypto from 'node:crypto';

/** 用户自定义 ID：4–20 位中文、字母、数字或下划线 */
export const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{4,20}$/;

export const USERNAME_RULE = '用户名 ID 需为 4–20 位中文、字母、数字或下划线，不能包含特殊符号';

export function isValidUsername(value) {
  return USERNAME_RE.test(String(value ?? ''));
}

/** 生成系统社区号：6 位数字（100000–999999） */
export function randomCommunityNo() {
  return String(crypto.randomInt(100000, 1000000));
}

/** 数据库层确保社区号唯一（生成时重试） */
export async function generateCommunityNo(db) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = randomCommunityNo();
    const rows = await db.query('SELECT id FROM users WHERE community_no = ? LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
  throw new Error('无法生成唯一社区号，请稍后重试');
}

/**
 * 为旧数据生成可用作 username 的基础字符串。
 * 只保留中文 / 字母 / 数字 / 下划线，长度不足时回退为 user_<id>。
 */
export function sanitizeUsernameSource(source, fallbackId) {
  let base = String(source ?? '').replace(/[^A-Za-z0-9_\u4e00-\u9fa5]/g, '');
  if (Array.from(base).length > 20) base = Array.from(base).slice(0, 20).join('');
  if (Array.from(base).length < 4) base = `user_${fallbackId}`;
  if (!USERNAME_RE.test(base)) base = `user_${fallbackId}`;
  return base;
}
