import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

describe('用户主页、热榜话题与社区数据', () => {
  let ctx;
  let alice;
  let bob;

  beforeEach(async () => {
    ctx = await createTestContext('users-stats');
    alice = await ctx.register('alice@example.com');
    bob = await ctx.register('bob@example.com');
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('用户主页返回资料与分页帖子', async () => {
    for (let index = 1; index <= 12; index += 1) {
      await ctx.createPost(alice.token, `Alice 的学习笔记 ${index}`);
    }
    await ctx.createPost(bob.token, 'Bob 的动态');

    const page1 = await ctx.agent.get(`/api/users/${alice.user.id}?page=1&size=10`);
    expect(page1.status).toBe(200);
    expect(page1.body.user.id).toBe(alice.user.id);
    expect(page1.body.user.nickname).toBe('同志_alice');
    expect(page1.body.user.email).toBeUndefined();
    expect(page1.body.posts).toHaveLength(10);
    expect(page1.body.total).toBe(12);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await ctx.agent.get(`/api/users/${alice.user.id}?page=2&size=10`);
    expect(page2.body.posts).toHaveLength(2);
    expect(page2.body.posts[0].content).toBe('Alice 的学习笔记 2');
    expect(page2.body.hasMore).toBe(false);

    const missing = await ctx.agent.get('/api/users/99999');
    expect(missing.status).toBe(404);
  });

  it('热榜按近 500 帖 #话题# 出现次数排序并缓存 60 秒', async () => {
    await ctx.createPost(alice.token, '今天读 #共产党宣言#，也想到 #资本论# 的方法。');
    await ctx.createPost(alice.token, '继续读 #共产党宣言#，常读常新。');
    await ctx.createPost(bob.token, '#十月革命# 的历史经验值得研究。');
    await ctx.createPost(bob.token, '没有话题的普通动态。');

    const first = await ctx.agent.get('/api/stats/hot-topics');
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);
    expect(first.body.list[0]).toEqual({ topic: '共产党宣言', count: 2 });
    const topics = first.body.list.map((item) => item.topic);
    expect(topics).toContain('资本论');
    expect(topics).toContain('十月革命');

    const second = await ctx.agent.get('/api/stats/hot-topics');
    expect(second.body.cached).toBe(true);
    expect(second.body.list).toEqual(first.body.list);
  });

  it('发帖后热榜缓存立即失效，后续请求能看到新话题', async () => {
    const before = await ctx.agent.get('/api/stats/hot-topics');
    expect(before.body.list).toEqual([]);

    await ctx.createPost(alice.token, '一起学习 #新话题# 的理论。');
    const after = await ctx.agent.get('/api/stats/hot-topics');
    expect(after.body.cached).toBe(false);
    expect(after.body.list.some((item) => item.topic === '新话题')).toBe(true);
  });

  it('社区数据为真实统计（注册 / 今日新增 / 今日发帖 / 馆藏）', async () => {    await ctx.createPost(alice.token, '社区统计测试 1');
    await ctx.createPost(bob.token, '社区统计测试 2');
    await ctx.deps.db.query(
      `INSERT INTO books (uploader_id, title, file_path, file_format, status)
       VALUES (?, '统计用图书', 'uploads/books/test/a.pdf', 'pdf', 1)`,
      [alice.user.id],
    );

    const response = await ctx.agent.get('/api/stats/community');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      users: 2,
      todayNewUsers: 2,
      todayPosts: 2,
      books: 1,
    });
  });

  it('在线用户接口无连接时返回空列表', async () => {
    const response = await ctx.agent.get('/api/stats/online');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 0, users: [] });
  });
});
