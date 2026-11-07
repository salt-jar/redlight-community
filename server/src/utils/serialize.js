/** 把数据库 DATETIME 字符串规范成 ISO-8601（UTC），便于前端相对时间计算 */
export function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) {
    const iso = text.replace(' ', 'T');
    return /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  }
  return text;
}

/** 解析 images 字段：MySQL JSON 可能为对象，SQLite 为字符串 */
export function parseImages(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: toNumber(row.id),
    email: row.email || '',
    nickname: row.nickname || '',
    username: row.username || '',
    communityNo: row.community_no || '',
    avatarUrl: row.avatar_url || '',
    bio: row.bio || '',
    role: toNumber(row.role),
    createdAt: toIso(row.created_at),
  };
}

/** 公开用户资料（不含邮箱） */
export function serializePublicUser(row) {
  if (!row) return null;
  return {
    id: toNumber(row.id),
    nickname: row.nickname || '',
    username: row.username || '',
    communityNo: row.community_no || '',
    avatarUrl: row.avatar_url || '',
    bio: row.bio || '',
    createdAt: toIso(row.created_at),
  };
}

function authorFromRow(row) {
  return {
    id: toNumber(row.user_id),
    nickname: row.author_nickname || '',
    avatarUrl: row.author_avatar_url || '',
    bio: row.author_bio || '',
  };
}

export function serializePost(row, { liked = false, repost = null } = {}) {
  if (!row) return null;
  return {
    id: toNumber(row.id),
    content: row.content || '',
    images: parseImages(row.images),
    repostId: row.repost_id === null || row.repost_id === undefined ? null : toNumber(row.repost_id),
    likeCount: toNumber(row.like_count),
    commentCount: toNumber(row.comment_count),
    liked: Boolean(liked),
    createdAt: toIso(row.created_at),
    user: authorFromRow(row),
    repost: repost ? serializeRepost(repost) : null,
  };
}

function serializeRepost(row) {
  return {
    id: toNumber(row.id),
    content: row.content || '',
    images: parseImages(row.images),
    createdAt: toIso(row.created_at),
    user: authorFromRow(row),
  };
}

export function serializeComment(row) {
  return {
    id: toNumber(row.id),
    postId: toNumber(row.post_id),
    content: row.content || '',
    createdAt: toIso(row.created_at),
    user: {
      id: toNumber(row.user_id),
      nickname: row.author_nickname || '',
      avatarUrl: row.author_avatar_url || '',
    },
  };
}

export function serializeBook(row) {
  return {
    id: toNumber(row.id),
    uploaderId: toNumber(row.uploader_id),
    title: row.title || '',
    author: row.author || '',
    category: row.category || '',
    description: row.description || '',
    coverUrl: row.cover_url || '',
    fileFormat: (row.file_format || 'pdf').toLowerCase(),
    fileSize: toNumber(row.file_size),
    downloadCount: toNumber(row.download_count),
    status: toNumber(row.status, 1),
    createdAt: toIso(row.created_at),
    uploader: row.uploader_nickname
      ? {
          id: toNumber(row.uploader_id),
          nickname: row.uploader_nickname || '',
          avatarUrl: row.uploader_avatar_url || '',
        }
      : undefined,
  };
}

export function serializeChatMessage(row) {
  return {
    id: toNumber(row.id),
    groupId: toNumber(row.group_id, 1),
    type: toNumber(row.type, 1),
    content: row.content || '',
    createdAt: toIso(row.created_at),
    user: {
      id: toNumber(row.user_id),
      nickname: row.author_nickname || '',
      avatarUrl: row.author_avatar_url || '',
    },
  };
}
