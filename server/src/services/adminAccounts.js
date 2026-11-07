import { generateCommunityNo, sanitizeUsernameSource, USERNAME_RE } from '../utils/identity.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidAdminEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

function normalizeAdminEmail(email, orgCode, username) {
  const value = String(email || '').trim().toLowerCase();
  if (value) return value;
  const local = `${String(orgCode).toLowerCase()}_${String(username).toLowerCase()}`.replace(/[^a-z0-9_.-]/g, '');
  return `${local || 'admin'}@admin.redlight.local`;
}

async function uniqueUsername(db, source, fallbackId) {
  let base = sanitizeUsernameSource(source, fallbackId);
  if (!USERNAME_RE.test(base)) base = `admin_${fallbackId}`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, Math.max(1, 20 - String(attempt).length - 1))}_${attempt}`;
    const rows = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
  return `admin_${Date.now().toString().slice(-7)}`;
}

/**
 * 为组织管理员创建 / 关联一个社区用户账号，并授予管理员角色。
 * 管理员在群聊等用户界面中就是普通用户，只是带有 role=1（蓝色管理员标识）。
 */
export async function ensureAdminCommunityUser(db, { email, username, displayName, orgCode }) {
  const normalizedEmail = normalizeAdminEmail(email, orgCode, username);
  const emailRows = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
  if (emailRows.length) {
    const existing = emailRows[0];
    if (Number(existing.role) !== 1) {
      await db.query('UPDATE users SET role = 1 WHERE id = ?', [existing.id]);
      existing.role = 1;
    }
    return existing;
  }

  const display = String(displayName || username || '').trim() || username;
  const userUsername = await uniqueUsername(db, username || display, 1);
  const nickname = String(display).slice(0, 32) || userUsername;
  const communityNo = await generateCommunityNo(db);
  const result = await db.query(
    'INSERT INTO users (email, nickname, username, community_no, role) VALUES (?, ?, ?, ?, 1)',
    [normalizedEmail, nickname, userUsername, communityNo],
  );
  const rows = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
  return rows[0];
}
