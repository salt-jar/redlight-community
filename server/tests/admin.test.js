import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';
import { hashPassword } from '../src/utils/password.js';

describe('门店管理后台', () => {
  let ctx;
  let storeId;

  beforeEach(async () => {
    ctx = await createTestContext('admin');
    storeId = 1001;
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function createAdmin(username = 'admin1001', password = 'Admin@12345') {
    const { salt, hash } = hashPassword(password);
    const result = await ctx.deps.db.query(
      'INSERT INTO store_admins (store_id, username, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)',
      [storeId, username, hash, salt, '一号门店管理员'],
    );
    return { id: result.insertId, username, password };
  }

  async function adminToken(admin, gatePassword = 'redlight-admin-gate') {
    const gate = await ctx.agent.post('/api/admin/gate').send({ storeId, password: gatePassword });
    expect(gate.status).toBe(200);
    const login = await ctx.agent
      .post('/api/admin/login')
      .send({ storeId, gateToken: gate.body.gateToken, username: admin.username, password: admin.password });
    expect(login.status).toBe(200);
    return login.body.token;
  }

  async function createReport(reporterToken, targetType, targetId, reason = '违法违规') {
    const response = await ctx.agent
      .post('/api/reports')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({ targetType, targetId, reason, detail: '自动化测试举报内容' });
    return response;
  }

  it('门店入口、两级密码验证与管理员登录态', async () => {
    await createAdmin();
    const publicStore = await ctx.agent.get('/api/admin/stores/1001/public');
    expect(publicStore.status).toBe(200);
    expect(publicStore.body.store).toMatchObject({ id: 1001, name: '一号门店' });
    expect((await ctx.agent.get('/api/admin/stores/9999/public')).status).toBe(404);

    const wrongGate = await ctx.agent.post('/api/admin/gate').send({ storeId, password: 'wrong-gate' });
    expect(wrongGate.status).toBe(403);
    const gate = await ctx.agent.post('/api/admin/gate').send({ storeId, password: 'redlight-admin-gate' });
    expect(gate.status).toBe(200);
    expect(gate.body.gateToken).toBeTruthy();

    const wrongLogin = await ctx.agent
      .post('/api/admin/login')
      .send({ storeId, gateToken: gate.body.gateToken, username: 'admin1001', password: 'wrong-password' });
    expect(wrongLogin.status).toBe(401);

    const login = await ctx.agent
      .post('/api/admin/login')
      .send({ storeId, gateToken: gate.body.gateToken, username: 'admin1001', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.admin.storeId).toBe(storeId);

    const noToken = await ctx.agent.get('/api/admin/stats');
    expect(noToken.status).toBe(401);
    const withGateToken = await ctx.agent.get('/api/admin/stats').set('Authorization', `Bearer ${gate.body.gateToken}`);
    expect(withGateToken.status).toBe(401);
    const me = await ctx.agent.get('/api/admin/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.admin.username).toBe('admin1001');
    expect(me.body.store.id).toBe(storeId);
  });

  it('文章举报进入后台，可下架文章并标记已处理', async () => {
    await createAdmin();
    const author = await ctx.register('author@example.com');
    const reporter = await ctx.register('reporter@example.com');
    const post = await ctx.createPost(author.token, '一篇会被举报并下架的文章');

    const report = await createReport(reporter.token, 'post', post.id);
    expect(report.status).toBe(201);
    expect(report.body.id).toBeTruthy();
    const duplicate = await createReport(reporter.token, 'post', post.id);
    expect(duplicate.status).toBe(409);

    const token = await adminToken({ username: 'admin1001', password: 'Admin@12345' });
    const list = await ctx.agent.get('/api/admin/reports?status=0').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const item = list.body.list.find((entry) => entry.id === report.body.id);
    expect(item.targetType).toBe('post');
    expect(item.reason).toBe('违法违规');
    expect(item.target.content).toContain('会被举报');
    expect(item.target.author.id).toBe(author.user.id);

    const action = await ctx.agent
      .post(`/api/admin/reports/${report.body.id}/action`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'remove_post' });
    expect(action.status).toBe(200);
    expect(action.body.targetStatus).toBe(0);

    const hidden = await ctx.agent.get(`/api/posts/${post.id}`);
    expect(hidden.status).toBe(404);
    const feed = await ctx.agent.get('/api/posts?page=1&size=20');
    expect(feed.body.list.some((entry) => entry.id === post.id)).toBe(false);

    const handled = await ctx.agent.get('/api/admin/reports?status=1').set('Authorization', `Bearer ${token}`);
    expect(handled.body.list.some((entry) => entry.id === report.body.id && entry.status === 1)).toBe(true);

    const repeated = await ctx.agent
      .post(`/api/admin/reports/${report.body.id}/action`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'remove_post' });
    expect(repeated.status).toBe(409);
  });

  it('图书举报进入后台，可下架图书', async () => {
    await createAdmin();
    const uploader = await ctx.register('uploader@example.com');
    const reporter = await ctx.register('bookreporter@example.com');
    const result = await ctx.deps.db.query(
      `INSERT INTO books (uploader_id, title, author, category, description, cover_url, file_path, file_format, file_size, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [uploader.user.id, '测试被举报图书', '测试作者', '其他', '测试', '/uploads/images/default-cover.svg', 'books/test.pdf', 'pdf', 1024],
    );
    const bookId = result.insertId;
    const report = await createReport(reporter.token, 'book', bookId, '侵权盗版');
    expect(report.status).toBe(201);

    const token = await adminToken({ username: 'admin1001', password: 'Admin@12345' });
    const action = await ctx.agent
      .post(`/api/admin/reports/${report.body.id}/action`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'remove_book' });
    expect(action.status).toBe(200);
    const detail = await ctx.agent.get(`/api/books/${bookId}`);
    expect(detail.status).toBe(404);
    const list = await ctx.agent.get('/api/books?page=1&size=20');
    expect(list.body.list.some((entry) => entry.id === bookId)).toBe(false);
  });

  it('可通过举报封锁用户，封锁后无法登录和写入，解除后恢复', async () => {
    await createAdmin();
    const author = await ctx.register('blockme@example.com');
    const reporter = await ctx.register('blockreporter@example.com');
    const post = await ctx.createPost(author.token, '举报后封锁作者的测试文章');
    const report = await createReport(reporter.token, 'post', post.id, '人身攻击');
    const token = await adminToken({ username: 'admin1001', password: 'Admin@12345' });

    const action = await ctx.agent
      .post(`/api/admin/reports/${report.body.id}/action`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'block_user' });
    expect(action.status).toBe(200);

    const blockedMe = await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${author.token}`);
    expect(blockedMe.status).toBe(403);
    const blockedWrite = await ctx.agent
      .post('/api/posts')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ content: '封禁后不应写入' });
    expect(blockedWrite.status).toBe(403);
    const blockedSendCode = await ctx.agent
      .post('/api/auth/send-code')
      .send({ email: 'blockme@example.com', purpose: 'login' });
    expect(blockedSendCode.status).toBe(403);

    const users = await ctx.agent.get('/api/admin/users?q=blockme').set('Authorization', `Bearer ${token}`);
    const listed = users.body.list.find((entry) => entry.id === author.user.id);
    expect(listed.status).toBe(0);

    const unblock = await ctx.agent
      .post(`/api/admin/users/${author.user.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 1 });
    expect(unblock.status).toBe(200);
    const activeMe = await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${author.token}`);
    expect(activeMe.status).toBe(200);
  });

  it('后台可管理文章、图书、用户状态并查看统计', async () => {
    await createAdmin();
    const user = await ctx.register('managed@example.com');
    const post = await ctx.createPost(user.token, '后台管理文章');
    const bookResult = await ctx.deps.db.query(
      `INSERT INTO books (uploader_id, title, author, category, description, cover_url, file_path, file_format, file_size, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [user.user.id, '后台管理图书', '作者', '其他', '', '/uploads/images/default-cover.svg', 'books/manage.pdf', 'pdf', 1024],
    );
    const token = await adminToken({ username: 'admin1001', password: 'Admin@12345' });

    const stats = await ctx.agent.get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.posts).toBeGreaterThanOrEqual(1);
    expect(stats.body.books).toBeGreaterThanOrEqual(1);

    const posts = await ctx.agent.get('/api/admin/posts?page=1&size=20').set('Authorization', `Bearer ${token}`);
    expect(posts.body.list.some((entry) => entry.id === post.id)).toBe(true);
    const postOff = await ctx.agent
      .post(`/api/admin/posts/${post.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 0 });
    expect(postOff.status).toBe(200);
    expect((await ctx.agent.get(`/api/posts/${post.id}`)).status).toBe(404);
    const postOn = await ctx.agent
      .post(`/api/admin/posts/${post.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 1 });
    expect(postOn.status).toBe(200);

    const bookId = bookResult.insertId;
    const books = await ctx.agent.get('/api/admin/books?page=1&size=20').set('Authorization', `Bearer ${token}`);
    expect(books.body.list.some((entry) => entry.id === bookId)).toBe(true);
    const bookOff = await ctx.agent
      .post(`/api/admin/books/${bookId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 0 });
    expect(bookOff.status).toBe(200);
    expect((await ctx.agent.get(`/api/books/${bookId}`)).status).toBe(404);

    const users = await ctx.agent.get('/api/admin/users?page=1&size=20').set('Authorization', `Bearer ${token}`);
    expect(users.body.list.some((entry) => entry.id === user.user.id)).toBe(true);
    const block = await ctx.agent
      .post(`/api/admin/users/${user.user.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 0 });
    expect(block.status).toBe(200);
    expect((await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${user.token}`)).status).toBe(403);
  });

  it('举报接口校验原因、目标与权限', async () => {
    const user = await ctx.register('report-validator@example.com');
    const post = await ctx.createPost(user.token, '校验举报的文章');
    const missingAuth = await ctx.agent.post('/api/reports').send({ targetType: 'post', targetId: post.id, reason: '违法违规' });
    expect(missingAuth.status).toBe(401);
    const badReason = await createReport(user.token, 'post', post.id, '不存在的理由');
    expect(badReason.status).toBe(400);
    const missingTarget = await createReport(user.token, 'post', 999999);
    expect(missingTarget.status).toBe(404);
    const badType = await createReport(user.token, 'comment', post.id);
    expect(badType.status).toBe(400);
  });
});
