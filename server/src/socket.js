import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { serializeChatMessage, serializePublicUser } from './utils/serialize.js';

const DEFAULT_GROUP_ID = 1;
const groupRoom = (groupId) => `chat:group:${groupId}`;

/**
 * 创建 Socket.IO 服务：握手 JWT 鉴权、群聊房间、消息落库后广播、在线用户统计。
 * @param {import('node:http').Server} httpServer
 */
export function createSocket(httpServer, { db, config, online, logger = console }) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((item) => item.trim()),
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
  });

  io.use(async (socket, next) => {
    const header = socket.handshake.headers?.authorization || '';
    const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!token) return next(new Error('未授权'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (!payload?.userId) return next(new Error('未授权'));
      const rows = await db.query('SELECT id, nickname, avatar_url, bio, status FROM users WHERE id = ? LIMIT 1', [payload.userId]);
      if (!rows.length) return next(new Error('未授权'));
      if (Number(rows[0].status) === 0) return next(new Error('账号已被封禁'));
      socket.data.user = serializePublicUser(rows[0]);
      return next();
    } catch {
      return next(new Error('未授权'));
    }
  });

  const broadcastOnline = () => {
    io.emit('chat:online', online.snapshot());
  };

  async function getActiveGroup(groupId) {
    const rows = await db.query('SELECT id FROM chat_groups WHERE id = ? AND status = 1 LIMIT 1', [groupId]);
    return rows[0] || null;
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    online.add(user, socket.id);
    broadcastOnline();
    socket.data.groupId = DEFAULT_GROUP_ID;
    socket.join(groupRoom(DEFAULT_GROUP_ID));
    socket.emit('chat:ready', { user, online: online.snapshot(), groupId: DEFAULT_GROUP_ID });

    socket.on('chat:join', async (data, ack) => {
      try {
        const groupId = Number(data?.groupId);
        if (!Number.isSafeInteger(groupId) || groupId <= 0) throw new Error('群聊参数不正确');
        const group = await getActiveGroup(groupId);
        if (!group) throw new Error('群聊不存在或已停用');
        if (socket.data.groupId) socket.leave(groupRoom(socket.data.groupId));
        socket.join(groupRoom(groupId));
        socket.data.groupId = groupId;
        if (typeof ack === 'function') ack({ ok: true, groupId });
      } catch (error) {
        socket.emit('chat:error', { msg: error.message });
        if (typeof ack === 'function') ack({ ok: false, msg: error.message });
      }
    });

    socket.on('chat:send', async (data, ack) => {
      try {
        const statusRows = await db.query('SELECT status FROM users WHERE id = ? LIMIT 1', [Number(user.id)]);
        if (!statusRows.length || Number(statusRows[0].status) === 0) {
          socket.emit('chat:error', { msg: '账号已被封禁' });
          socket.disconnect(true);
          return;
        }
        const groupId = Number(data?.groupId ?? socket.data.groupId ?? DEFAULT_GROUP_ID);
        const group = await getActiveGroup(groupId);
        if (!group) throw new Error('群聊不存在或已停用');
        const rawType = Number(data?.type);
        if (rawType !== 1 && rawType !== 2) throw new Error('消息类型不正确');
        const type = rawType;
        const content = String(data?.content ?? '').trim();
        if (!content) throw new Error('消息内容不能为空');
        if (type === 1 && Array.from(content).length > 1000) throw new Error('单条消息不能超过 1000 字');
        if (type === 2 && !/^\/uploads\/images\/[\w.\-]+$/.test(content)) {
          throw new Error('图片地址不合法，请先上传图片');
        }
        const result = await db.query(
          'INSERT INTO chat_messages (group_id, user_id, type, content) VALUES (?, ?, ?, ?)',
          [groupId, Number(user.id), type, content],
        );
        const rows = await db.query(
          `SELECT m.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url
           FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ? LIMIT 1`,
          [result.insertId],
        );
        const message = serializeChatMessage(rows[0]);
        io.to(groupRoom(groupId)).emit('chat:message', message);
        if (typeof ack === 'function') ack({ ok: true, id: message.id, groupId });
      } catch (error) {
        logger.warn(`[socket] 消息发送失败：${error.message}`);
        socket.emit('chat:error', { msg: error.message || '消息发送失败' });
        if (typeof ack === 'function') ack({ ok: false, msg: error.message });
      }
    });

    socket.on('disconnect', () => {
      online.remove(user.id, socket.id);
      broadcastOnline();
    });
  });

  return io;
}
