import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  openSocket,
  waitFor,
  waitForConnection,
  waitForEvent,
} from './helpers/context.js';

describe('Socket.IO 群聊', () => {
  let ctx;
  let alice;
  let bob;
  const sockets = [];

  beforeEach(async () => {
    ctx = await createTestContext('chat');
    alice = await ctx.register('alice@example.com');
    bob = await ctx.register('bob@example.com');
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await ctx.close();
  });

  function connect(token) {
    const socket = openSocket(ctx.baseUrl, token);
    sockets.push(socket);
    return socket;
  }

  it('未携带或携带无效 token 的连接被拒绝，提示未授权', async () => {
    const invalid = connect('invalid-token');
    await expect(waitForConnection(invalid)).rejects.toThrow('未授权');

    const anonymous = connect('');
    await expect(waitForConnection(anonymous)).rejects.toThrow('未授权');
  });

  it('有效 token 可连接，同一用户多标签只计一次，在线人数实时更新', async () => {
    const first = connect(alice.token);
    const readyPromise = waitForEvent(first, 'chat:ready');
    await waitForConnection(first);
    const ready = await readyPromise;
    expect(ready.user.nickname).toBe('同志_alice');

    await waitFor(async () => {
      const online = await ctx.agent.get('/api/stats/online');
      return online.body.count === 1;
    });

    const secondTab = connect(alice.token);
    await waitForConnection(secondTab);
    const afterSecondTab = await ctx.agent.get('/api/stats/online');
    expect(afterSecondTab.body.count).toBe(1);

    const onlineEvent = waitForEvent(first, 'chat:online');
    const bobSocket = connect(bob.token);
    await waitForConnection(bobSocket);
    const snapshot = await onlineEvent;
    expect(snapshot.count).toBe(2);
    expect(snapshot.users.map((user) => user.nickname).sort()).toEqual(['同志_alice', '同志_bob']);

    bobSocket.close();
    await waitFor(async () => {
      const online = await ctx.agent.get('/api/stats/online');
      return online.body.count === 1;
    });
  });

  it('文字消息落库并广播给所有在线用户', async () => {
    const aliceSocket = connect(alice.token);
    const bobSocket = connect(bob.token);
    await waitForConnection(aliceSocket);
    await waitForConnection(bobSocket);

    const aliceMessage = waitForEvent(aliceSocket, 'chat:message');
    const bobMessage = waitForEvent(bobSocket, 'chat:message');
    const ack = new Promise((resolve) => {
      aliceSocket.emit('chat:send', { type: 1, content: '同志们好！' }, resolve);
    });

    const [receivedByAlice, receivedByBob, ackResult] = await Promise.all([aliceMessage, bobMessage, ack]);
    expect(receivedByAlice.content).toBe('同志们好！');
    expect(receivedByAlice.user.nickname).toBe('同志_alice');
    expect(receivedByBob.id).toBe(receivedByAlice.id);
    expect(ackResult).toEqual({ ok: true, id: receivedByAlice.id });

    const rows = await ctx.deps.db.query('SELECT * FROM chat_messages');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(1);
    expect(rows[0].content).toBe('同志们好！');

    const history = await ctx.agent.get('/api/chat/history?limit=50');
    expect(history.body.list).toHaveLength(1);
    expect(history.body.list[0].content).toBe('同志们好！');
  });

  it('支持图片消息，拒绝非法图片地址与空消息', async () => {
    const socket = connect(alice.token);
    await waitForConnection(socket);

    const imageMessage = waitForEvent(socket, 'chat:message');
    socket.emit('chat:send', { type: 2, content: '/uploads/images/red-star.png' });
    const image = await imageMessage;
    expect(image.type).toBe(2);
    expect(image.content).toBe('/uploads/images/red-star.png');

    const errorEvent = waitForEvent(socket, 'chat:error');
    socket.emit('chat:send', { type: 2, content: 'http://evil.example/x.png' });
    const error = await errorEvent;
    expect(error.msg).toContain('图片地址');

    const emptyError = waitForEvent(socket, 'chat:error');
    socket.emit('chat:send', { type: 1, content: '   ' });
    expect((await emptyError).msg).toContain('不能为空');

    const typeError = waitForEvent(socket, 'chat:error');
    socket.emit('chat:send', { type: 3, content: '未知类型' });
    expect((await typeError).msg).toContain('类型');
  });

  it('历史消息最近 50 条、上滑 beforeId 分页且保持正序', async () => {
    for (let index = 1; index <= 60; index += 1) {
      await ctx.deps.db.query('INSERT INTO chat_messages (user_id, type, content) VALUES (?, 1, ?)', [
        alice.user.id,
        `历史消息 ${index}`,
      ]);
    }

    const latest = await ctx.agent.get('/api/chat/history?limit=50');
    expect(latest.status).toBe(200);
    expect(latest.body.list).toHaveLength(50);
    expect(latest.body.list[0].content).toBe('历史消息 11');
    expect(latest.body.list[49].content).toBe('历史消息 60');
    expect(latest.body.hasMore).toBe(true);

    const beforeId = latest.body.list[0].id;
    const earlier = await ctx.agent.get(`/api/chat/history?limit=50&beforeId=${beforeId}`);
    expect(earlier.body.list).toHaveLength(10);
    expect(earlier.body.list[0].content).toBe('历史消息 1');
    expect(earlier.body.list[9].content).toBe('历史消息 10');
    expect(earlier.body.hasMore).toBe(false);
  });
});
