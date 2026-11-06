import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

describe('邮箱验证码登录', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await createTestContext('auth');
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('发送 6 位验证码，5 分钟有效，60 秒限流', async () => {
    const email = 'code@example.com';
    const first = await ctx.agent.post('/api/auth/send-code').send({ email });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.devCode).toMatch(/^\d{6}$/);
    expect(first.body.expiresIn).toBe(300);
    expect(first.body.cooldown).toBe(60);
    expect(await ctx.deps.cache.get(`email:code:${email}`)).toBe(first.body.devCode);

    const second = await ctx.agent.post('/api/auth/send-code').send({ email });
    expect(second.status).toBe(429);
    expect(second.body.retryAfter).toBe(60);
    expect(await ctx.deps.cache.get(`email:code:${email}`)).toBe(first.body.devCode);
  });

  it('邮箱格式非法返回 400', async () => {
    const response = await ctx.agent.post('/api/auth/send-code').send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('邮箱');
  });

  it('验证码错误返回 400，并写入 status=0 登录日志', async () => {
    const email = 'wrong@example.com';
    await ctx.deps.cache.set(`email:code:${email}`, '135790', 300);
    const response = await ctx.agent
      .post('/api/auth/login')
      .set('User-Agent', 'vitest-failed-agent')
      .send({ email, code: '000000' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('验证码');

    const logs = await ctx.deps.db.query('SELECT * FROM login_logs ORDER BY id DESC');
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(0);
    expect(logs[0].user_id).toBe(0);
    expect(logs[0].email).toBe(email);
    expect(logs[0].login_ip).toBeTruthy();
    expect(logs[0].user_agent).toBe('vitest-failed-agent');
  });

  it('验证码过期或不存在时写入失败日志', async () => {
    const email = 'expired@example.com';
    const response = await ctx.agent.post('/api/auth/login').send({ email, code: '123456' });
    expect(response.status).toBe(400);
    const logs = await ctx.deps.db.query('SELECT status FROM login_logs WHERE email = ?', [email]);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(0);
  });

  it('首次登录自动注册，昵称为「同志_<邮箱前缀前 6 位>」，JWT 有效 7 天', async () => {
    const email = 'abcdef123@example.com';
    const sent = await ctx.agent.post('/api/auth/send-code').send({ email });
    expect(sent.status).toBe(200);
    // 清空限流，避免影响同邮箱后续操作
    const response = await ctx.agent
      .post('/api/auth/login')
      .set('User-Agent', 'vitest-success-agent')
      .send({ email, code: sent.body.devCode });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.nickname).toBe('同志_abcdef');

    const payload = jwt.decode(response.body.token);
    expect(payload.userId).toBe(response.body.user.id);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);

    const me = await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${response.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.nickname).toBe('同志_abcdef');

    const logs = await ctx.deps.db.query('SELECT * FROM login_logs WHERE email = ?', [email]);
    expect(logs.some((log) => log.status === 1 && log.user_id === response.body.user.id)).toBe(true);
    expect(logs[0].user_agent).toBe('vitest-success-agent');
  });

  it('老用户再次登录不会重复建号', async () => {
    const email = 'again@example.com';
    const first = await ctx.register(email);
    await ctx.deps.cache.set(`email:code:${email}`, '246810', 300);
    const second = await ctx.agent.post('/api/auth/login').send({ email, code: '246810' });
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.user.id);
    const users = await ctx.deps.db.query('SELECT id FROM users WHERE email = ?', [email]);
    expect(users).toHaveLength(1);
    expect(second.body.user.nickname).toBe('同志_again');
  });

  it('登录成功后验证码失效，不能重复使用', async () => {
    const email = 'once@example.com';
    const sent = await ctx.agent.post('/api/auth/send-code').send({ email });
    await ctx.agent.post('/api/auth/login').send({ email, code: sent.body.devCode });
    const retry = await ctx.agent.post('/api/auth/login').send({ email, code: sent.body.devCode });
    expect(retry.status).toBe(400);
  });

  it('未登录访问受保护资源返回 401', async () => {
    const me = await ctx.agent.get('/api/auth/me');
    expect(me.status).toBe(401);
    const create = await ctx.agent.post('/api/posts').send({ content: '未登录发帖' });
    expect(create.status).toBe(401);
    const like = await ctx.agent.post('/api/posts/1/like');
    expect(like.status).toBe(401);
  });

  it('非 6 位数字验证码返回 400', async () => {
    const response = await ctx.agent.post('/api/auth/login').send({ email: 'x@example.com', code: '12ab' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('6 位');
  });
});
