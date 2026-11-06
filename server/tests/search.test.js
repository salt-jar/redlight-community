import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

describe('全局搜索（图书 + 用户）', () => {
  let ctx;
  let auth;
  let userId;

  beforeEach(async () => {
    ctx = await createTestContext('search');
    auth = await ctx.register('alpha@example.com');
    userId = auth.user.id;
  });
  afterEach(async () => {
    await ctx.close();
  });

  async function insertBook(title, author = '', description = '', category = '马恩著作', status = 1) {
    const result = await ctx.deps.db.query(
      `INSERT INTO books (uploader_id, title, author, category, description, cover_url, file_path, file_format, file_size, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title,
        author,
        category,
        description,
        '/uploads/images/default-cover.svg',
        `uploads/books/test/${encodeURIComponent(title)}.pdf`,
        'pdf',
        1024,
        status,
      ],
    );
    return result.insertId;
  }

  it('中文关键词可命中图书（SQLite LIKE 回退）', async () => {
    await insertBook('共产党宣言', '马克思 恩格斯', '科学社会主义纲领性文献');
    await insertBook('资本论（第一卷）', '马克思', '政治经济学经典');
    await ctx.deps.db.query('UPDATE users SET nickname = ? WHERE id = ?', ['红星照耀', userId]);

    const overview = await ctx.agent.get(`/api/search?q=${encodeURIComponent('共产党')}`);
    expect(overview.status).toBe(200);
    expect(overview.body.books).toHaveLength(1);
    expect(overview.body.books[0].title).toBe('共产党宣言');

    const byAuthor = await ctx.agent.get(`/api/search?q=${encodeURIComponent('恩格斯')}`);
    expect(byAuthor.body.books[0].title).toBe('共产党宣言');

    const byDesc = await ctx.agent.get(`/api/search?q=${encodeURIComponent('政治经济学')}`);
    expect(byDesc.body.books[0].title).toContain('资本论');
  });

  it('昵称片段与邮箱前缀可搜索到用户', async () => {
    await ctx.deps.db.query('UPDATE users SET nickname = ? WHERE id = ?', ['红星照耀', userId]);
    await ctx.register('beta-reader@example.com');

    const byNickname = await ctx.agent.get(`/api/search?q=${encodeURIComponent('红星')}`);
    expect(byNickname.status).toBe(200);
    expect(byNickname.body.users.some((user) => user.nickname === '红星照耀')).toBe(true);

    const byEmail = await ctx.agent.get('/api/search?q=beta-reader');
    expect(byEmail.body.users.some((user) => user.nickname === '同志_beta-r')).toBe(true);
  });

  it('综合搜索图书与用户各最多 5 条', async () => {
    for (let index = 1; index <= 7; index += 1) {
      await insertBook(`马列著作 ${index}`, '编者', '马列主义理论');
    }
    for (let index = 1; index <= 7; index += 1) {
      await ctx.register(`mali${index}@example.com`);
    }

    const response = await ctx.agent.get(`/api/search?q=${encodeURIComponent('马列')}`);
    expect(response.status).toBe(200);
    expect(response.body.books.length).toBeLessThanOrEqual(5);

    const users = await ctx.agent.get('/api/search/users?q=mali&page=1&size=5');
    expect(users.body.list).toHaveLength(5);
    expect(users.body.total).toBe(7);
    expect(users.body.hasMore).toBe(true);
  });

  it('图书搜索支持分页与分类筛选，排除未上架图书', async () => {
    for (let index = 1; index <= 7; index += 1) {
      await insertBook(`列宁笔记 ${index}`, '列宁', '哲学笔记', '列宁著作');
    }
    await insertBook('未上架草稿', '列宁', '哲学笔记', '列宁著作', 0);

    const page1 = await ctx.agent.get(`/api/search/books?q=${encodeURIComponent('列宁')}&page=1&size=3`);
    expect(page1.status).toBe(200);
    expect(page1.body.list).toHaveLength(3);
    expect(page1.body.total).toBe(7);
    expect(page1.body.hasMore).toBe(true);

    const page3 = await ctx.agent.get(`/api/search/books?q=${encodeURIComponent('列宁')}&page=3&size=3`);
    expect(page3.body.list).toHaveLength(1);
    expect(page3.body.hasMore).toBe(false);

    const filtered = await ctx.agent.get(`/api/search/books?q=${encodeURIComponent('列宁')}&category=${encodeURIComponent('哲学')}`);
    expect(filtered.body.total).toBe(0);

    const category = await ctx.agent.get(`/api/search/books?category=${encodeURIComponent('列宁著作')}`);
    expect(category.body.total).toBe(7);
  });

  it('用户搜索支持分页；空关键词返回空结果', async () => {
    for (let index = 1; index <= 12; index += 1) {
      await ctx.register(`reader${index}@example.com`);
    }

    const page1 = await ctx.agent.get('/api/search/users?q=reader&page=1&size=10');
    expect(page1.body.list).toHaveLength(10);
    expect(page1.body.total).toBe(12);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await ctx.agent.get('/api/search/users?q=reader&page=2&size=10');
    expect(page2.body.list).toHaveLength(2);
    expect(page2.body.hasMore).toBe(false);

    const empty = await ctx.agent.get('/api/search');
    expect(empty.body).toEqual({ books: [], users: [] });
  });
});
