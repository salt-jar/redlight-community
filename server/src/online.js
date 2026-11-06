/** 在线用户登记表：按用户去重，同一用户多标签页只计一次 */
export function createOnlineRegistry() {
  const byUser = new Map();

  return {
    add(user, socketId) {
      const id = Number(user.id);
      const existing = byUser.get(id);
      if (existing) {
        existing.sockets.add(socketId);
      } else {
        byUser.set(id, {
          user: { id, nickname: user.nickname || '', avatarUrl: user.avatarUrl || '' },
          sockets: new Set([socketId]),
        });
      }
    },
    remove(userId, socketId) {
      const id = Number(userId);
      const existing = byUser.get(id);
      if (!existing) return;
      existing.sockets.delete(socketId);
      if (existing.sockets.size === 0) byUser.delete(id);
    },
    snapshot() {
      const users = [...byUser.values()].map((item) => item.user).sort((a, b) => a.id - b.id);
      return { count: users.length, users };
    },
  };
}
