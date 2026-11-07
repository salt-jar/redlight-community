export const AT_ALL_LIMIT = 3;
export const AT_ALL_TOKEN = '@所有人';

/** 以服务器本地时间的周一作为每周起点，返回 YYYY-MM-DD */
export function getWeekKey(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - mondayOffset);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getAtAllUsed(db, userId, weekKey = getWeekKey()) {
  const rows = await db.query(
    'SELECT COUNT(*) AS total FROM chat_at_all_usage WHERE user_id = ? AND week_key = ?',
    [Number(userId), weekKey],
  );
  return Number(rows[0]?.total || 0);
}

export async function consumeAtAll(db, userId, weekKey = getWeekKey()) {
  await db.query('INSERT INTO chat_at_all_usage (user_id, week_key) VALUES (?, ?)', [Number(userId), weekKey]);
}
