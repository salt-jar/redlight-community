import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';
import { hashPassword } from '../src/utils/password.js';

describe('组织与 SQL 开发者管理后台', () => {
  let ctx;
  const orgCode = '001';

  beforeEach(async () => {
    ctx = await createTestContext('admin');
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function createAdmin(username = 'admin001', password = 'Admin@12345') {
    const { salt, hash } = hashPassword(password);
    const result = await ctx.deps.db.query(
      'INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)',
      [orgCode, username, hash, salt, '组织管理员'],
    );
    return { id: result.insertId, username, password };
  }

  async function adminToken(admin, gatePassword = 'SQL') {
    const gate = await ctx.agent.post(`/api/admin/orgs/${orgCode}/unlock`).send({ password: gatePassword });
    expect(gate.status).toBe(200);
    const login = await ctx.agent
      .post(`/api/admin/orgs/${orgCode}/login`)
      .send({ gateToken: gate.body.gateToken, username: admin.username, password: admin.password });
    expect(login.status).toBe(200);
    return login.body.token;
  }

  async function developerToken() {
    const login = await ctx.agent.post('/api/admin/sql/login').send({ password: '1111' });
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

  async function communityLogin(email, purpose = 'login') {
    const send = await ctx.agent.post('/api/auth/send-code').send({ email, purpose });
    expect(send.status).toBe(200);
    const login = await ctx.agent
      .post('/api/auth/login')
      .send({ email, code: send.body.devCode });
    expect(login.status).toBe(200);
    return login.body;
  }

  async function registerOrgAdmin(overrides = {}) {
    const gate = await ctx.agent.post('/api/admin/orgs/001/unlock').send({ password: 'SQL' });
    const payload = {
      gateToken: gate.body.gateToken,
      username: 'linked_admin',
      password: 'Admin@12345',
      displayName: '赤光管理员',
      email: 'linked-admin@example.com',
      ...overrides,
    };
    return ctx.agent.post('/api/admin/orgs/001/register').send(payload);
  }

  it('组织入口、SQL 系统密码 + 个人密码与管理员登录态', async () => {
    await createAdmin();
    const publicOrg = await ctx.agent.get('/api/admin/orgs/001/public');
    expect(publicOrg.status).toBe(200);
    expect(publicOrg.body.organization).toMatchObject({ code: '001', name: '赤光社组织' });
    expect((await ctx.agent.get('/api/admin/orgs/999/public')).status).toBe(404);

    const wrongGate = await ctx.agent.post('/api/admin/orgs/001/unlock').send({ password: 'wrong-gate' });
    expect(wrongGate.status).toBe(403);
    const gate = await ctx.agent.post('/api/admin/orgs/001/unlock').send({ password: 'SQL' });
    expect(gate.status).toBe(200);
    expect(gate.body.gateToken).toBeTruthy();

    const wrongLogin = await ctx.agent
      .post('/api/admin/orgs/001/login')
      .send({ gateToken: gate.body.gateToken, username: 'admin001', password: 'wrong-password' });
    expect(wrongLogin.status).toBe(401);

    const login = await ctx.agent
      .post('/api/admin/orgs/001/login')
      .send({ gateToken: gate.body.gateToken, username: 'admin001', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.admin.scope).toBe('org');
    expect(login.body.admin.orgCode).toBe('001');

    const noToken = await ctx.agent.get('/api/admin/stats');
    expect(noToken.status).toBe(401);
    const withGateToken = await ctx.agent.get('/api/admin/stats').set('Authorization', `Bearer ${gate.body.gateToken}`);
    expect(withGateToken.status).toBe(401);
    const me = await ctx.agent.get('/api/admin/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.admin.username).toBe('admin001');
    expect(me.body.organization.code).toBe('001');

    const orgCannotManage = await ctx.agent
      .get('/api/admin/organizations')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(orgCannotManage.status).toBe(403);
  });

  it('SQL 开发者系统使用 1111 登录，拥有组织与系统设置高权限', async () => {
    await createAdmin();
    const wrong = await ctx.agent.post('/api/admin/sql/login').send({ password: '0000' });
    expect(wrong.status).toBe(403);
    const login = await ctx.agent.post('/api/admin/sql/login').send({ password: '1111' });
    expect(login.status).toBe(200);
    expect(login.body.admin.scope).toBe('sql');
    expect(login.body.organization).toBeNull();
    const token = login.body.token;

    const me = await ctx.agent.get('/api/admin/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.admin.scope).toBe('sql');

    const orgs = await ctx.agent.get('/api/admin/organizations').set('Authorization', `Bearer ${token}`);
    expect(orgs.status).toBe(200);
    expect(orgs.body.list.some((item) => item.code === '001')).toBe(true);

    const settings = await ctx.agent.get('/api/admin/settings').set('Authorization', `Bearer ${token}`);
    expect(settings.status).toBe(200);
    expect(settings.body.list.some((item) => item.key === 'org.001.gate_password')).toBe(true);

    const update = await ctx.agent
      .put('/api/admin/settings/org.001.gate_password')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'SQL-NEW' });
    expect(update.status).toBe(200);
    const newGate = await ctx.agent.post('/api/admin/orgs/001/unlock').send({ password: 'SQL-NEW' });
    expect(newGate.status).toBe(200);
    const oldGate = await ctx.agent.post('/api/admin/orgs/001/unlock').send({ password: 'SQL' });
    expect(oldGate.status).toBe(403);
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

    const token = await adminToken({ username: 'admin001', password: 'Admin@12345' });
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

    const token = await adminToken({ username: 'admin001', password: 'Admin@12345' });
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
    const token = await adminToken({ username: 'admin001', password: 'Admin@12345' });

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

    // 封锁后该用户的内容、主页与搜索结果都不再对普通用户可见
    const feed = await ctx.agent.get('/api/posts?page=1&size=20');
    expect(feed.body.list.some((entry) => entry.id === post.id)).toBe(false);
    expect((await ctx.agent.get(`/api/posts/${post.id}`)).status).toBe(404);
    expect((await ctx.agent.get(`/api/users/${author.user.id}`)).status).toBe(404);
    const search = await ctx.agent.get('/api/search/users?q=blockme');
    expect(search.body.list.some((entry) => entry.id === author.user.id)).toBe(false);

    const users = await ctx.agent.get('/api/admin/users?q=blockme').set('Authorization', `Bearer ${token}`);
    const listed = users.body.list.find((entry) => entry.id === author.user.id);
    expect(listed.status).toBe(0);
    const adminPosts = await ctx.agent.get('/api/admin/posts?page=1&size=20').set('Authorization', `Bearer ${token}`);
    expect(adminPosts.body.list.some((entry) => entry.id === post.id)).toBe(true);

    const unblock = await ctx.agent
      .post(`/api/admin/users/${author.user.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 1 });
    expect(unblock.status).toBe(200);
    const activeMe = await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${author.token}`);
    expect(activeMe.status).toBe(200);
    const restoredFeed = await ctx.agent.get('/api/posts?page=1&size=20');
    expect(restoredFeed.body.list.some((entry) => entry.id === post.id)).toBe(true);
    expect((await ctx.agent.get(`/api/users/${author.user.id}`)).status).toBe(200);
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
    const token = await adminToken({ username: 'admin001', password: 'Admin@12345' });

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
    const bookOn = await ctx.agent
      .post(`/api/admin/books/${bookId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 1 });
    expect(bookOn.status).toBe(200);

    const users = await ctx.agent.get('/api/admin/users?page=1&size=20').set('Authorization', `Bearer ${token}`);
    expect(users.body.list.some((entry) => entry.id === user.user.id)).toBe(true);
    const block = await ctx.agent
      .post(`/api/admin/users/${user.user.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 0 });
    expect(block.status).toBe(200);
    expect((await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${user.token}`)).status).toBe(403);
    expect((await ctx.agent.get(`/api/books/${bookId}`)).status).toBe(404);
    const unblock = await ctx.agent
      .post(`/api/admin/users/${user.user.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 1 });
    expect(unblock.status).toBe(200);
    expect((await ctx.agent.get(`/api/books/${bookId}`)).status).toBe(200);
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

  it('组织管理员注册时同步创建管理员社区用户，并可登录群聊', async () => {
    const registered = await registerOrgAdmin();
    expect(registered.status).toBe(201);
    expect(registered.body.admin.userId).toBeTruthy();
    expect(registered.body.admin.email).toBe('linked-admin@example.com');

    const linkedUser = await ctx.deps.db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [
      'linked-admin@example.com',
    ]);
    expect(linkedUser).toHaveLength(1);
    expect(Number(linkedUser[0].role)).toBe(1);
    const adminRow = await ctx.deps.db.query("SELECT user_id FROM organization_admins WHERE username = 'linked_admin'");
    expect(Number(adminRow[0].user_id)).toBe(Number(linkedUser[0].id));

    const duplicate = await registerOrgAdmin();
    expect(duplicate.status).toBe(409);

    const community = await communityLogin('linked-admin@example.com');
    expect(community.user.role).toBe(1);
    const me = await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${community.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe(1);
  });

  it('组织管理员可在后台创建群聊，普通用户不能创建', async () => {
    const registered = await registerOrgAdmin();
    const adminToken = registered.body.token;
    const user = await ctx.register('group-normal@example.com');

    const created = await ctx.agent
      .post('/api/admin/chat-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '青年学习小组', description: '自动化测试创建' });
    expect(created.status).toBe(201);
    expect(created.body.group.name).toBe('青年学习小组');

    const normalCreate = await ctx.agent
      .post('/api/admin/chat-groups')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: '普通用户不能创建的群' });
    expect(normalCreate.status).toBe(401);

    const groups = await ctx.agent.get('/api/admin/chat-groups').set('Authorization', `Bearer ${adminToken}`);
    expect(groups.status).toBe(200);
    expect(groups.body.list.some((group) => group.name === '青年学习小组')).toBe(true);

    const publicGroups = await ctx.agent
      .get('/api/chat/groups')
      .set('Authorization', `Bearer ${user.token}`);
    expect(publicGroups.body.list.some((group) => group.name === '青年学习小组')).toBe(true);
  });

  it('管理员社区账号可直接下架文章、封锁用户，普通用户无权操作', async () => {
    const registered = await registerOrgAdmin();
    expect(registered.status).toBe(201);
    const adminCommunity = await communityLogin('linked-admin@example.com');
    const normal = await ctx.register('moderation-normal@example.com');
    const post = await ctx.createPost(normal.token, '管理员直接下架的测试文章');

    const forbidden = await ctx.agent
      .post(`/api/moderation/posts/${post.id}/status`)
      .set('Authorization', `Bearer ${normal.token}`)
      .send({ status: 0 });
    expect(forbidden.status).toBe(403);

    const removed = await ctx.agent
      .post(`/api/moderation/posts/${post.id}/status`)
      .set('Authorization', `Bearer ${adminCommunity.token}`)
      .send({ status: 0 });
    expect(removed.status).toBe(200);
    expect((await ctx.agent.get(`/api/posts/${post.id}`)).status).toBe(404);

    const blocked = await ctx.agent
      .post(`/api/moderation/users/${normal.user.id}/status`)
      .set('Authorization', `Bearer ${adminCommunity.token}`)
      .send({ status: 0 });
    expect(blocked.status).toBe(200);
    expect((await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${normal.token}`)).status).toBe(403);

    await ctx.agent
      .post(`/api/moderation/users/${normal.user.id}/status`)
      .set('Authorization', `Bearer ${adminCommunity.token}`)
      .send({ status: 1 });
    expect((await ctx.agent.get('/api/auth/me').set('Authorization', `Bearer ${normal.token}`)).status).toBe(200);
  });
});
