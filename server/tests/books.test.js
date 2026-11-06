import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, FIXTURES } from './helpers/context.js';

const pdfBuffer = fs.readFileSync(path.join(FIXTURES, 'sample.pdf'));
const epubBuffer = fs.readFileSync(path.join(FIXTURES, 'sample.epub'));

function zipWith(entries) {
  const zip = new AdmZip();
  for (const [name, data] of entries) {
    zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  }
  return zip.toBuffer();
}

describe('图书 ZIP 上传、安全解压与下载', () => {
  let ctx;
  let auth;

  beforeEach(async () => {
    ctx = await createTestContext('books');
    auth = await ctx.register('librarian@example.com');
  });
  afterEach(async () => {
    await ctx.close();
  });

  function upload(token, buffer, fields = {}, filename = 'book.zip') {
    let request = ctx.agent.post('/api/books/upload').set('Authorization', `Bearer ${token}`);
    const payload = { title: '共产党宣言', author: '马克思 恩格斯', category: '马恩著作', description: '测试图书', ...fields };
    for (const [key, value] of Object.entries(payload)) {
      request = request.field(key, String(value));
    }
    return request.attach('zipFile', buffer, { filename, contentType: 'application/zip' });
  }

  it('合法 PDF ZIP 上传成功、提取封面、清理临时文件', async () => {
    const response = await upload(auth.token, zipWith([['文献/共产党宣言.pdf', pdfBuffer]]));
    expect(response.status).toBe(200);
    const book = response.body.book;
    expect(book.title).toBe('共产党宣言');
    expect(book.fileFormat).toBe('pdf');
    expect(book.status).toBe(1);
    expect(book.coverUrl).toBeTruthy();
    expect(book.coverUrl).toMatch(/cover\.png$/);
    expect(book.uploader.nickname).toBe('同志_librar');

    const rows = await ctx.deps.db.query('SELECT * FROM books');
    expect(rows).toHaveLength(1);
    const storedPath = path.resolve(ctx.config.appRoot, rows[0].file_path);
    expect(fs.existsSync(storedPath)).toBe(true);
    const coverPath = path.resolve(ctx.config.uploadDir, book.coverUrl.replace('/uploads/', ''));
    expect(fs.existsSync(coverPath)).toBe(true);
    expect(fs.readdirSync(ctx.config.tempDir)).toEqual([]);
  });

  it('EPUB ZIP 上传成功并提取内置封面', async () => {
    const response = await upload(auth.token, zipWith([['book.epub', epubBuffer]]), { title: '共产党宣言（EPUB）' });
    expect(response.status).toBe(200);
    expect(response.body.book.fileFormat).toBe('epub');
    expect(response.body.book.coverUrl).toMatch(/cover\.jpg$/);
    const coverPath = path.resolve(ctx.config.uploadDir, response.body.book.coverUrl.replace('/uploads/', ''));
    expect(fs.existsSync(coverPath)).toBe(true);
  });

  it('图书库分类筛选、分页与详情', async () => {
    await upload(auth.token, zipWith([['a.epub', epubBuffer]]), { title: '马恩经典', category: '马恩著作' });
    await upload(auth.token, zipWith([['b.epub', epubBuffer]]), { title: '列宁笔记', category: '列宁著作' });
    await upload(auth.token, zipWith([['c.epub', epubBuffer]]), { title: '哲学札记', category: '哲学' });

    const all = await ctx.agent.get('/api/books?page=1&size=2');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.list).toHaveLength(2);
    expect(all.body.hasMore).toBe(true);

    const category = await ctx.agent.get(`/api/books?category=${encodeURIComponent('列宁著作')}`);
    expect(category.body.total).toBe(1);
    expect(category.body.list[0].title).toBe('列宁笔记');

    const id = category.body.list[0].id;
    const detail = await ctx.agent.get(`/api/books/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.book.title).toBe('列宁笔记');
    expect(detail.body.book.uploader.nickname).toBe('同志_librar');
    expect(detail.body.book.description).toBe('测试图书');
  });

  it('在线文件流与下载附件，download_count 累加', async () => {
    const uploaded = await upload(auth.token, zipWith([['book.pdf', pdfBuffer]]));
    const id = uploaded.body.book.id;

    const inline = await ctx.agent.get(`/api/books/${id}/file`);
    expect(inline.status).toBe(200);
    expect(inline.headers['content-type']).toContain('application/pdf');
    expect(inline.headers['content-disposition']).toContain('inline');
    expect(Number(inline.headers['content-length'])).toBe(pdfBuffer.length);

    const download = await ctx.agent.get(`/api/books/${id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');

    const after = await ctx.deps.db.query('SELECT download_count FROM books WHERE id = ?', [id]);
    expect(Number(after[0].download_count)).toBe(1);

    await ctx.agent.get(`/api/books/${id}/download`);
    const afterSecond = await ctx.deps.db.query('SELECT download_count FROM books WHERE id = ?', [id]);
    expect(Number(afterSecond[0].download_count)).toBe(2);
  });

  it('拒绝路径穿越 ZIP 且不残留解压目录', async () => {
    const zip = new AdmZip();
    zip.addFile('evil.pdf', pdfBuffer);
    zip.getEntries()[0].entryName = '../evil.pdf';
    const response = await upload(auth.token, zip.toBuffer());
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('路径穿越');

    const rows = await ctx.deps.db.query('SELECT * FROM books');
    expect(rows).toHaveLength(0);
    expect(fs.readdirSync(ctx.config.booksDir)).toEqual([]);
    expect(fs.readdirSync(ctx.config.tempDir)).toEqual([]);
  });

  it('拒绝包含可执行文件的 ZIP，并清理目录与临时文件', async () => {
    const response = await upload(
      auth.token,
      zipWith([
        ['book.pdf', pdfBuffer],
        ['tool.exe', 'MZ fake executable'],
      ]),
    );
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('可执行文件');
    expect(fs.readdirSync(ctx.config.booksDir)).toEqual([]);
    expect(fs.readdirSync(ctx.config.tempDir)).toEqual([]);
  });

  it('ZIP 内没有 PDF/EPUB 时拒绝并清理目录', async () => {
    const response = await upload(auth.token, zipWith([['readme.txt', 'hello']]));
    expect(response.status).toBe(400);
    expect(response.body.msg).toContain('未找到');
    expect(fs.readdirSync(ctx.config.booksDir)).toEqual([]);
    expect(fs.readdirSync(ctx.config.tempDir)).toEqual([]);
  });

  it('非 ZIP 内容和缺少书名均被拒绝，临时 ZIP 不残留', async () => {
    const notZip = await upload(auth.token, Buffer.from('this is not a zip'));
    expect(notZip.status).toBe(400);

    const missingTitle = await upload(auth.token, zipWith([['book.pdf', pdfBuffer]]), { title: '   ' });
    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.msg).toContain('书名');
    expect(fs.readdirSync(ctx.config.tempDir)).toEqual([]);
  });

  it('未登录不能上传图书', async () => {
    const response = await ctx.agent
      .post('/api/books/upload')
      .field('title', '未授权')
      .attach('zipFile', zipWith([['book.epub', epubBuffer]]), 'book.zip');
    expect(response.status).toBe(401);
  });
});

describe('图书上传体积阈值', () => {
  it('超过配置的 ZIP 大小限制返回 413', async () => {
    const ctx = await createTestContext('books-limit', { limits: { zipSize: 2048 } });
    try {
      const auth = await ctx.register('limit@example.com');
      const zip = new AdmZip();
      zip.addFile('book.pdf', Buffer.concat([pdfBuffer, Buffer.alloc(4096)]));
      const response = await ctx.agent
        .post('/api/books/upload')
        .set('Authorization', `Bearer ${auth.token}`)
        .field('title', '超大图书')
        .attach('zipFile', zip.toBuffer(), { filename: 'big.zip', contentType: 'application/zip' });
      expect(response.status).toBe(413);
      expect(response.body.msg).toContain('超过限制');
    } finally {
      await ctx.close();
    }
  });
});
