import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

describe('信息流、点赞、评论与转发', () => {
  let ctx;
  let auth;

  beforeEach(async () => {
    ctx = await createTestContext('posts');
    auth = await ctx.register('poster@example.com');
  });
  afterEach(async () => {
    await ctx.close();
  });

  const authed = () => ({ Authorization: `Bearer ${auth.token}` });

  it('倒序分页返回帖子且不重复、不遗漏', async () => {
    for (let index = 1; index <= 25; index += 1) {
      await ctx.createPost(auth.token, `动态 ${index}`);
    }

    const first = await ctx.agent.get('/api/posts?page=1&size=20').set(authed());
    expect(first.status).toBe(200);
    expect(first.body.list).toHaveLength(20);
    expect(first.body.total).toBe(25);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.list[0].content).toBe('动态 25');
    expect(first.body.list[0].user.nickname).toBe('同志_poster');
    const firstIds = first.body.list.map((post) => post.id);

    const second = await ctx.agent.get('/api/posts?page=2&size=20').set(authed());
    expect(second.body.list).toHaveLength(5);
    expect(second.body.hasMore).toBe(false);
    const secondIds = second.body.list.map((post) => post.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(25);
  });

  it('发布校验：空正文、超 1000 字、超 9 图、非法图片地址均被拒绝', async () => {
    const empty = await ctx.agent.post('/api/posts').set(authed()).send({ content: '   ' });
    expect(empty.status).toBe(400);

    const tooLong = await ctx.agent.post('/api/posts').set(authed()).send({ content: '字'.repeat(1001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.msg).toContain('1000');

    const tooManyImages = await ctx.agent
      .post('/api/posts')
      .set(authed())
      .send({ content: '十张图', images: Array.from({ length: 10 }, (_, i) => `/uploads/images/${i}.png`) });
    expect(tooManyImages.status).toBe(400);
    expect(tooManyImages.body.msg).toContain('9');

    const badImage = await ctx.agent
      .post('/api/posts')
      .set(authed())
      .send({ content: '非法图片', images: ['javascript:alert(1)'] });
    expect(badImage.status).toBe(400);
  });

  it('支持发布 9 张配图的帖子', async () => {
    const images = Array.from({ length: 9 }, (_, i) => `/uploads/images/${i}.png`);
    const response = await ctx.agent.post('/api/posts').set(authed()).send({
      content: '今天重读《共产党宣言》，收获很大。',
      images,
    });
    expect(response.status).toBe(200);
    expect(response.body.post.images).toHaveLength(9);
    expect(response.body.post.user.nickname).toBe('同志_poster');
    expect(response.body.post.likeCount).toBe(0);
  });

  it('点赞幂等：再次点击取消，like_count 与点赞表一致', async () => {
    const post = await ctx.createPost(auth.token, '点赞测试');
    const first = await ctx.agent.post(`/api/posts/${post.id}/like`).set(authed());
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ liked: true, likeCount: 1 });

    const likes = await ctx.deps.db.query('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?', [post.id]);
    expect(Number(likes[0].total)).toBe(1);

    const second = await ctx.agent.post(`/api/posts/${post.id}/like`).set(authed());
    expect(second.body).toEqual({ liked: false, likeCount: 0 });
    const after = await ctx.deps.db.query('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?', [post.id]);
    expect(Number(after[0].total)).toBe(0);

    const third = await ctx.agent.post(`/api/posts/${post.id}/like`).set(authed());
    expect(third.body).toEqual({ liked: true, likeCount: 1 });
  });

  it('评论即时落库、按时间正序返回并同步 comment_count', async () => {
    const post = await ctx.createPost(auth.token, '评论测试');

    const empty = await ctx.agent.post(`/api/posts/${post.id}/comments`).set(authed()).send({ content: '  ' });
    expect(empty.status).toBe(400);
    const tooLong = await ctx.agent
      .post(`/api/posts/${post.id}/comments`)
      .set(authed())
      .send({ content: '评'.repeat(501) });
    expect(tooLong.status).toBe(400);

    const first = await ctx.agent
      .post(`/api/posts/${post.id}/comments`)
      .set(authed())
      .send({ content: '第一条评论' });
    expect(first.status).toBe(200);
    expect(first.body.commentCount).toBe(1);

    const second = await ctx.agent
      .post(`/api/posts/${post.id}/comment`)
      .set(authed())
      .send({ content: '第二条评论' });
    expect(second.status).toBe(200);
    expect(second.body.commentCount).toBe(2);

    const list = await ctx.agent.get(`/api/posts/${post.id}/comments`).set(authed());
    expect(list.status).toBe(200);
    expect(list.body.list.map((item) => item.content)).toEqual(['第一条评论', '第二条评论']);
    expect(list.body.list[0].user.nickname).toBe('同志_poster');

    const detail = await ctx.agent.get(`/api/posts/${post.id}`).set(authed());
    expect(detail.body.post.commentCount).toBe(2);
  });

  it('转发生成 repost_id 新帖，并在信息流中返回原帖引用', async () => {
    const original = await ctx.createPost(auth.token, '原文：重读《资本论》第一卷', ['/uploads/images/a.png']);
    const repost = await ctx.agent
      .post(`/api/posts/${original.id}/repost`)
      .set(authed())
      .send({ content: '转发并附上评论' });
    expect(repost.status).toBe(200);
    expect(repost.body.post.repostId).toBe(original.id);
    expect(repost.body.post.repost.content).toBe(original.content);
    expect(repost.body.post.repost.user.nickname).toBe('同志_poster');
    expect(repost.body.post.repost.images).toEqual(['/uploads/images/a.png']);

    const feed = await ctx.agent.get('/api/posts?page=1&size=10').set(authed());
    expect(feed.body.list[0].id).toBe(repost.body.post.id);
    expect(feed.body.list[0].repost.id).toBe(original.id);

    const detail = await ctx.agent.get(`/api/posts/${repost.body.post.id}`).set(authed());
    expect(detail.body.post.repostId).toBe(original.id);
    expect(detail.body.post.repost.content).toContain('资本论');
  });

  it('不存在的帖子返回 404', async () => {
    const detail = await ctx.agent.get('/api/posts/99999').set(authed());
    expect(detail.status).toBe(404);
    const like = await ctx.agent.post('/api/posts/99999/like').set(authed());
    expect(like.status).toBe(404);
    const comment = await ctx.agent.post('/api/posts/99999/comments').set(authed()).send({ content: 'hi' });
    expect(comment.status).toBe(404);
    const repost = await ctx.agent.post('/api/posts/99999/repost').set(authed()).send({ content: '' });
    expect(repost.status).toBe(404);
  });

  it('点赞状态会随当前用户返回', async () => {
    const post = await ctx.createPost(auth.token, '点赞态测试');
    await ctx.agent.post(`/api/posts/${post.id}/like`).set(authed());
    const feed = await ctx.agent.get('/api/posts').set(authed());
    expect(feed.body.list[0].liked).toBe(true);
    expect(feed.body.list[0].likeCount).toBe(1);
  });
});
