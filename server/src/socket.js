import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { serializeChatMessage, serializePublicUser } from './utils/serialize.js';

/**
 * 创建 Socket.IO 服务：握手 JWT 鉴权、消息落库后广播、在线用户统计。
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
      const rows = await db.query('SELECT id, nickname, avatar_url, bio FROM users WHERE id = ? LIMIT 1', [payload.userId]);
      if (!rows.length) return next(new Error('未授权'));
      socket.data.user = serializePublicUser(rows[0]);
      return next();
    } catch {
      return next(new Error('未授权'));
    }
  });

  const broadcastOnline = () => {
    io.emit('chat:online', online.snapshot());
  };

  io.on('connection', (socket) => {
    const user = socket.data.user;
    online.add(user, socket.id);
    broadcastOnline();
    socket.emit('chat:ready', { user, online: online.snapshot() });

    socket.on('chat:send', async (data, ack) => {
      try {
        const type = Number(data?.type) === 2 ? 2 : 1;
        const content = String(data?.content ?? '').trim();
        if (!content) throw new Error('消息内容不能为空');
        if (type === 1 && Array.from(content).length > 1000) throw new Error('单条消息不能超过 1000 字');
        if (type === 2 && !/^\/uploads\/images\/[\w.\-]+$/.test(content)) {
          throw new Error('图片地址不合法，请先上传图片');
        }
        const result = await db.query('INSERT INTO chat_messages (user_id, type, content) VALUES (?, ?, ?)', [
          Number(user.id),
          type,
          content,
        ]);
        const rows = await db.query(
          `SELECT m.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar_url
           FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ? LIMIT 1`,
          [result.insertId],
        );
        const message = serializeChatMessage(rows[0]);
        io.emit('chat:message', message);
        if (typeof ack === 'function') ack({ ok: true, id: message.id });
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
