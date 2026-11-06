import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

describe('邮箱验证码注册与登录', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await createTestContext('auth');
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('发送 6 位注册验证码，5 分钟有效，60 秒限流', async () => {
    const email = 'code@example.com';
    const payload = { email, purpose: 'register' };
    const first = await ctx.agent.post('/api/auth/send-code').send(payload);
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.purpose).toBe('register');
    expect(first.body.devCode).toMatch(/^\d{6}$/);
    expect(first.body.expiresIn).toBe(300);
    expect(first.body.cooldown).toBe(60);
    expect(await ctx.deps.cache.get(`email:code:${email}`)).toBe(first.body.devCode);

    const second = await ctx.agent.post('/api/auth/send-code').send(payload);
    expect(second.status).toBe(429);
    expect(second.body.retryAfter).toBe(60);
    expect(await ctx.deps.cache.get(`email:code:${email}`)).toBe(first.body.devCode);
  });

  it('登录验证码拒绝未注册邮箱，注册验证码拒绝已注册邮箱', async () => {
    const loginSend = await ctx.agent
      .post('/api/auth/send-code')
      .send({ email: 'missing@example.com', purpose: 'login' });
    expect(loginSend.status).toBe(400);
    expect(loginSend.body.msg).toContain('尚未注册');

    await ctx.register('exists@example.com');
    const registerSend = await ctx.agent
      .post('/api/auth/send-code')
      .send({ email: 'exists@example.com', purpose: 'register' });
    expect(registerSend.status).toBe(409);
    expect(registerSend.body.msg).toContain('已注册');
  });

  it('邮箱格式非法返回 400', async () => {
    const response = await ctx.agent.post('/api/auth/send-code').send({ email: 'not-an-email', purpose: 'register' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('邮箱');
  });

  it('注册成功：自定义用户名 ID、昵称同步、6 位社区号、7 天 JWT、成功登录日志', async () => {
    const email = 'newuser@example.com';
    const username = 'redstar_2026';
    const sent = await ctx.agent.post('/api/auth/send-code').send({ email, purpose: 'register' });
    expect(sent.status).toBe(200);

    const response = await ctx.agent
      .post('/api/auth/register')
      .set('User-Agent', 'vitest-register-agent')
      .send({ email, code: sent.body.devCode, username });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.username).toBe(username);
    expect(response.body.user.nickname).toBe(username);
    expect(response.body.user.communityNo).toMatch(/^\d{6}$/);

    const payload = jwt.decode(response.body.token);
    expect(payload.userId).toBe(response.body.user.id);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);

    const me = await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${response.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(username);
    expect(me.body.user.communityNo).toBe(response.body.user.communityNo);

    const byUsername = await ctx.agent.get(`/api/search/users?q=${encodeURIComponent(username)}`);
    expect(byUsername.body.list.some((user) => user.username === username)).toBe(true);
    const byCommunity = await ctx.agent.get(`/api/search/users?q=${response.body.user.communityNo}`);
    expect(byCommunity.body.list.some((user) => user.communityNo === response.body.user.communityNo)).toBe(true);

    const logs = await ctx.deps.db.query('SELECT * FROM login_logs WHERE email = ?', [email]);
    expect(logs.some((log) => log.status === 1 && log.user_id === response.body.user.id)).toBe(true);
    expect(logs[0].user_agent).toBe('vitest-register-agent');
  });

  it('社区号随机且唯一', async () => {
    const first = await ctx.register('community1@example.com');
    const second = await ctx.register('community2@example.com');
    expect(first.user.communityNo).toMatch(/^\d{6}$/);
    expect(second.user.communityNo).toMatch(/^\d{6}$/);
    expect(first.user.communityNo).not.toBe(second.user.communityNo);
  });

  it('注册拒绝重复邮箱、重复用户名 ID 与非法用户名', async () => {
    const first = await ctx.register('unique1@example.com');
    const repeatedUsername = first.user.username;

    await ctx.deps.cache.set('email:code:unique2@example.com', '123456', 300);
    const duplicateName = await ctx.agent
      .post('/api/auth/register')
      .send({ email: 'unique2@example.com', code: '123456', username: repeatedUsername });
    expect(duplicateName.status).toBe(409);
    expect(duplicateName.body.msg).toContain('用户名');

    await ctx.deps.cache.set('email:code:unique1@example.com', '123456', 300);
    const duplicateEmail = await ctx.agent
      .post('/api/auth/register')
      .send({ email: 'unique1@example.com', code: '123456', username: 'another_id' });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.msg).toContain('邮箱');

    const badEmail = 'badname@example.com';
    await ctx.deps.cache.set(`email:code:${badEmail}`, '123456', 300);
    for (const username of ['abc', 'a b', 'bad-id', '<script>', 'a'.repeat(21)]) {
      const response = await ctx.agent
        .post('/api/auth/register')
        .send({ email: badEmail, code: '123456', username });
      expect(response.status, `应拒绝用户名：${username}`).toBe(400);
    }
  });

  it('验证码错误返回 400，并写入 status=0 登录日志', async () => {
    const account = await ctx.register('wrong@example.com');
    await ctx.deps.cache.set('email:code:wrong@example.com', '135790', 300);
    const response = await ctx.agent
      .post('/api/auth/login')
      .set('User-Agent', 'vitest-failed-agent')
      .send({ email: 'wrong@example.com', code: '000000' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('验证码');

    const logs = await ctx.deps.db.query('SELECT * FROM login_logs WHERE email = ? ORDER BY id DESC', [
      'wrong@example.com',
    ]);
    expect(logs[0].status).toBe(0);
    expect(logs[0].user_id).toBe(account.user.id);
    expect(logs[0].login_ip).toBeTruthy();
    expect(logs[0].user_agent).toBe('vitest-failed-agent');
  });

  it('验证码过期或不存在时写入失败日志', async () => {
    const account = await ctx.register('expired@example.com');
    await ctx.deps.cache.del('email:code:expired@example.com');
    const response = await ctx.agent.post('/api/auth/login').send({ email: 'expired@example.com', code: '123456' });
    expect(response.status).toBe(400);
    const logs = await ctx.deps.db.query('SELECT * FROM login_logs WHERE email = ? ORDER BY id DESC', [
      'expired@example.com',
    ]);
    expect(logs[0].status).toBe(0);
    expect(logs[0].user_id).toBe(account.user.id);
  });

  it('未注册邮箱登录返回 400，不再自动建号', async () => {
    const email = 'unregistered@example.com';
    const response = await ctx.agent
      .post('/api/auth/login')
      .set('User-Agent', 'vitest-unregistered-agent')
      .send({ email, code: '123456' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('尚未注册');
    const users = await ctx.deps.db.query('SELECT id FROM users WHERE email = ?', [email]);
    expect(users).toHaveLength(0);
    const logs = await ctx.deps.db.query('SELECT * FROM login_logs WHERE email = ?', [email]);
    expect(logs[0].status).toBe(0);
    expect(logs[0].user_id).toBe(0);
  });

  it('老用户再次登录不会重复建号，用户名与社区号保持不变', async () => {
    const email = 'again@example.com';
    const first = await ctx.register(email);
    await ctx.deps.cache.set(`email:code:${email}`, '246810', 300);
    const second = await ctx.agent.post('/api/auth/login').send({ email, code: '246810' });
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.user.id);
    expect(second.body.user.username).toBe(first.user.username);
    expect(second.body.user.communityNo).toBe(first.user.communityNo);
    const users = await ctx.deps.db.query('SELECT id FROM users WHERE email = ?', [email]);
    expect(users).toHaveLength(1);
  });

  it('登录成功后验证码失效，不能重复使用', async () => {
    const email = 'once@example.com';
    const sent = await ctx.agent.post('/api/auth/send-code').send({ email, purpose: 'register' });
    await ctx.agent
      .post('/api/auth/register')
      .send({ email, code: sent.body.devCode, username: 'once_user' });
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

  it('非 6 位数字验证码返回 400 并记录失败日志', async () => {
    const account = await ctx.register('x@example.com');
    const response = await ctx.agent.post('/api/auth/login').send({ email: 'x@example.com', code: '12ab' });
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('6 位');
    const logs = await ctx.deps.db.query('SELECT * FROM login_logs WHERE email = ? ORDER BY id DESC', ['x@example.com']);
    expect(logs[0].status).toBe(0);
    expect(logs[0].user_id).toBe(account.user.id);
  });
});
