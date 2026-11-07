import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const tempDir = path.join(__dirname, '.tmp');
const screenshotsDir = path.join(__dirname, 'screenshots');
const serverDir = path.join(projectRoot, 'server');
const clientDir = path.join(projectRoot, 'client');
const fixturesDir = path.join(__dirname, 'fixtures');

const SERVER_PORT = 3101;
const WEB_PORT = 5188;
const serverBase = `http://127.0.0.1:${SERVER_PORT}`;
const webBase = `http://127.0.0.1:${WEB_PORT}`;
const TOKEN_KEY = 'redlight_token';
const USER_KEY = 'redlight_user';

const children = [];
let browser = null;
const pageErrors = [];
const consoleErrors = [];
let step = 0;

function log(message) {
  console.log(`[e2e] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, message, timeout = 20000, interval = 150) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(`等待超时（${timeout}ms）：${message}${lastError ? `；最后错误：${lastError.message}` : ''}`);
}

async function waitForText(locator, expected, timeout = 15000) {
  await waitFor(async () => ((await locator.textContent()) || '').includes(expected), `文本包含「${expected}」`, timeout);
}

async function shot(page, name, fullPage = false) {
  step += 1;
  const file = path.join(screenshotsDir, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  log(`截图：${path.relative(projectRoot, file)}`);
  return file;
}

function startChild(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  });
  const lines = [];
  const collect = (chunk) => {
    const text = chunk.toString();
    lines.push(text);
    if (lines.length > 200) lines.shift();
    if (process.env.E2E_VERBOSE) process.stdout.write(`[${name}] ${text}`);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  child.on('exit', (code) => lines.push(`[${name}] exited with ${code}`));
  children.push({ name, child, lines });
  return { child, lines };
}

async function stopChild(entry) {
  if (!entry?.child || entry.child.exitCode !== null) return;
  try {
    entry.child.kill();
  } catch {
    /* ignore */
  }
  await Promise.race([
    new Promise((resolve) => entry.child.once('exit', resolve)),
    sleep(3000),
  ]);
  if (entry.child.exitCode === null) {
    try {
      spawn('taskkill', ['/PID', String(entry.child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
}

async function stopAllChildren() {
  for (const entry of children.reverse()) {
    await stopChild(entry);
  }
}

async function waitForHttp(url, label, timeout = 60000) {
  await waitFor(
    async () => {
      const response = await fetch(url);
      return response.ok;
    },
    `${label} 可访问（${url}）`,
    timeout,
    400,
  );
}

function makeZip(sourceFile, innerName, targetFile) {
  const zip = new AdmZip();
  zip.addLocalFile(sourceFile, '', innerName);
  zip.writeZip(targetFile);
  return targetFile;
}

async function apiLogin(email) {
  const sendResponse = await fetch(`${serverBase}/api/auth/send-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, purpose: 'register' }),
  });
  const sendBody = await sendResponse.json();
  assert(sendResponse.ok, `第二用户验证码发送失败：${JSON.stringify(sendBody)}`);
  const loginResponse = await fetch(`${serverBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'e2e-second-user' },
    body: JSON.stringify({
      email,
      code: sendBody.devCode,
      username: `peer_${email.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(-10)}`,
    }),
  });
  const loginBody = await loginResponse.json();
  assert(loginResponse.ok, `第二用户注册失败：${JSON.stringify(loginBody)}`);
  return loginBody;
}

async function fillTestId(page, testId, value) {
  const root = page.locator(`[data-testid="${testId}"]`).first();
  await root.waitFor({ state: 'visible' });
  const input = root.locator('input, textarea').first();
  if ((await input.count()) > 0) await input.fill(value);
  else await root.fill(value);
}

async function waitForTestId(page, testId) {
  const root = page.locator(`[data-testid="${testId}"]`).first();
  await root.waitFor({ state: 'visible' });
  return root;
}

async function canvasHasContent(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pdf-canvas"]');
    if (!canvas || canvas.width < 500 || canvas.height < 500) return false;
    const context = canvas.getContext('2d');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    for (let index = 0; index < data.length; index += 400) {
      if (data[index] < 240 || data[index + 1] < 240 || data[index + 2] < 240) nonWhite += 1;
    }
    return nonWhite > 40;
  });
}

async function measureLayout(page) {  return page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: Math.round(box.width * 100) / 100,
        height: Math.round(box.height * 100) / 100,
        display: style.display,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0,
      };
    };
    return {
      side: read('.side-nav'),
      main: read('.app-main'),
      right: read('.right-sidebar'),
      mobileTab: read('.mobile-tab'),
      header: read('.app-header'),
      background: getComputedStyle(document.body).backgroundColor,
      headerBackground: getComputedStyle(document.querySelector('.app-header')).backgroundColor,
      cardRadius: document.querySelector('.composer-trigger')
        ? getComputedStyle(document.querySelector('.composer-trigger')).borderRadius
        : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

async function main() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(screenshotsDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(tempDir, 'os'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'uploads'), { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const pdfZip = makeZip(path.join(fixturesDir, '共产党宣言.pdf'), '文献/共产党宣言.pdf', path.join(tempDir, '共产党宣言.zip'));
  const epubZip = makeZip(path.join(fixturesDir, '共产党宣言.epub'), '共产党宣言.epub', path.join(tempDir, '共产党宣言-EPUB.zip'));

  log('启动后端（SQLite 免依赖模式）...');
  startChild('server', process.execPath, ['src/index.js'], {
    cwd: serverDir,
    env: {
      NODE_ENV: 'development',
      PORT: String(SERVER_PORT),
      HOST: '127.0.0.1',
      DB_DRIVER: 'sqlite',
      DB_FILE: path.join(tempDir, 'redlight.db'),
      UPLOAD_DIR: path.join(tempDir, 'uploads'),
      JWT_SECRET: 'redlight-e2e-secret',
      ADMIN_GATE_PASSWORD: 'redlight-admin-gate',
      ADMIN_BOOTSTRAP_PASSWORD: 'Admin@12345',
      SMTP_HOST: '',
      REDIS_URL: '',
      CORS_ORIGIN: '*',
      TEMP: path.join(tempDir, 'os'),
      TMP: path.join(tempDir, 'os'),
    },
  });

  log('启动前端 Vite 开发服务器...');
  startChild('vite', process.execPath, [path.join(clientDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
    cwd: clientDir,
    env: {
      VITE_PROXY_TARGET: serverBase,
      TEMP: path.join(tempDir, 'os'),
      TMP: path.join(tempDir, 'os'),
    },
  });

  await waitForHttp(`${serverBase}/api/health`, '后端');
  await waitForHttp(webBase, '前端');
  log('前后端已就绪');

  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  // 1. 未登录守卫
  log('检查未登录路由守卫...');
  await page.goto(webBase, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/login', { timeout: 20000 });
  assert((await page.locator('.login-page').count()) === 1, '未登录应进入登录页');
  await page.waitForSelector('[data-testid="login-email"]');
  await shot(page, 'login');

  // 2. 注册新账号（登录与注册分离）
  const email = `e2e${Date.now()}@example.com`;
  const username = `同志_${email.split('@')[0].slice(0, 6)}`;
  log(`注册邮箱：${email}，用户名 ID：${username}`);
  await page.click('[data-testid="login-tab-register"]');
  await page.waitForSelector('[data-testid="register-username"]', { state: 'visible' });
  await fillTestId(page, 'login-email', email);
  await fillTestId(page, 'register-username', username);
  const sendCodeResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/send-code') && response.request().method() === 'POST',
  );
  await page.click('[data-testid="send-code"]');
  const sendResult = await sendCodeResponse;
  const sendBody = await sendResult.json();
  assert(sendResult.status() === 200, `发送验证码应成功，实际 ${sendResult.status()}`);
  assert(sendBody.purpose === 'register', '注册验证码用途应为 register');
  assert(/^\d{6}$/.test(sendBody.devCode || ''), '开发模式应返回 6 位 devCode');
  await page.waitForSelector('[data-testid="dev-code"]');
  await fillTestId(page, 'login-code', sendBody.devCode);
  const registerResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST',
  );
  await page.click('[data-testid="auth-submit"]');
  const registerResult = await registerResponse;
  assert(registerResult.status() === 200, `注册应成功，实际 ${registerResult.status()}`);
  const loginBody = await registerResult.json();
  assert(loginBody.user.username === username, '注册后用户名 ID 应保持一致');
  assert(/^\d{6}$/.test(loginBody.user.communityNo || ''), '注册后应生成 6 位社区号');
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
  await page.waitForSelector('[data-testid="composer-trigger"]');
  log(`注册成功，昵称：${loginBody.user.nickname}，社区号：${loginBody.user.communityNo}`);
  assert((await page.evaluate(() => localStorage.getItem('redlight_token')) || '').length > 20, 'token 应持久化到 localStorage');

  // 3. 三栏布局与配色
  log('检查三栏布局与设计 tokens...');
  const layout = await measureLayout(page);
  assert(layout.header.height === 56, `顶栏高度应为 56px，实际 ${layout.header.height}`);
  assert(Math.abs(layout.side.width - 200) < 2, `左侧导航应为 200px，实际 ${layout.side.width}`);
  assert(Math.abs(layout.main.width - 680) < 2, `主内容应为 680px，实际 ${layout.main.width}`);
  assert(Math.abs(layout.right.width - 280) < 2, `右边栏应为 280px，实际 ${layout.right.width}`);
  assert(layout.headerBackground === 'rgb(200, 16, 46)', `顶栏主色应为 #C8102E，实际 ${layout.headerBackground}`);
  assert(layout.background === 'rgb(250, 248, 245)', `页面背景应为 #FAF8F5，实际 ${layout.background}`);
  assert(layout.cardRadius === '8px', `卡片圆角应为 8px，实际 ${layout.cardRadius}`);
  assert(layout.overflow <= 1, `宽屏不应横向溢出，溢出 ${layout.overflow}px`);

  // 4. 发布帖子
  log('发布带话题与 @ 的动态...');
  await page.click('[data-testid="composer-trigger"]');
  await waitForTestId(page, 'composer-textarea');
  const postContent = '今天重读 #共产党宣言# ，@列宁 同志怎么看？这是赤光社的自动化验收动态。';
  await fillTestId(page, 'composer-textarea', postContent);
  const createPostResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/posts') && response.request().method() === 'POST',
  );
  await page.click('[data-testid="composer-submit"]');
  const createPostResult = await createPostResponse;
  assert(createPostResult.status() === 200, '发布帖子应成功');
  const createPostBody = await createPostResult.json();
  const postId = createPostBody.post.id;
  await page.waitForSelector(`.post-card:has-text("自动化验收动态")`);
  const postCard = page.locator('.post-card').filter({ hasText: '自动化验收动态' }).first();
  assert((await postCard.locator('.topic-link').textContent()).includes('共产党宣言'), '话题应高亮');
  assert((await postCard.locator('.mention-link').textContent()).includes('列宁'), '应高亮 @ 用户');

  // 5. 点赞、评论、转发
  log('检查点赞幂等与计数...');
  const likeButton = postCard.locator('[data-testid="like-button"]');
  const likeResponse = page.waitForResponse((response) => /\/api\/posts\/\d+\/like$/.test(response.url()));
  await likeButton.click();
  assert((await likeResponse).status() === 200, '点赞接口应成功');
  await waitForText(likeButton, '1');
  assert((await likeButton.getAttribute('class')).includes('active'), '点赞后应高亮');

  log('发表评论...');
  await postCard.locator('[data-testid="comment-button"]').click();
  await waitForTestId(page, 'comment-input');
  await fillTestId(page, 'comment-input', '说得好，常读常新！');
  const commentResponse = page.waitForResponse((response) => /\/api\/posts\/\d+\/comments$/.test(response.url()));
  await postCard.locator('[data-testid="comment-submit"]').click();
  assert((await commentResponse).status() === 200, '评论接口应成功');
  await waitForText(postCard.locator('.comment-list'), '说得好，常读常新！');
  await waitForText(postCard.locator('[data-testid="comment-button"]'), '1');

  log('转发并附加评论...');
  await postCard.locator('[data-testid="repost-button"]').click();
  await waitForTestId(page, 'repost-textarea');
  await fillTestId(page, 'repost-textarea', '转发学习，继续读原著。');
  const repostResponse = page.waitForResponse((response) => /\/api\/posts\/\d+\/repost$/.test(response.url()));
  await page.locator('.ant-modal-footer .ant-btn-primary').last().click();
  assert((await repostResponse).status() === 200, '转发接口应成功');
  await page.waitForSelector('.post-card .repost-quote');
  await waitForText(page.locator('.post-card').first(), '转发学习，继续读原著。');
  await waitFor(async () => (await page.locator('.ant-modal-wrap:visible').count()) === 0, '转发表单应关闭');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="feed"] .post-card');
  await sleep(400);
  await shot(page, 'home-feed');

  // 6. 上传 PDF 图书并在线阅读
  log('上传 PDF 图书 ZIP...');
  await page.click('[data-testid="header-upload"]');
  await page.waitForURL((url) => url.pathname === '/upload', { timeout: 15000 });
  await fillTestId(page, 'upload-title', '共产党宣言');
  await fillTestId(page, 'upload-author', '马克思 恩格斯');
  await fillTestId(page, 'upload-description', '科学社会主义纲领性文献，E2E 上传测试。');
  await page.setInputFiles('[data-testid="upload-input"]', pdfZip);
  await page.waitForSelector('.drop-title:has-text("共产党宣言.zip")');
  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/api/books/upload'),
    { timeout: 120000 },
  );
  await page.click('[data-testid="upload-submit"]');
  const uploaded = await uploadResponse;
  const uploadedBody = await uploaded.json();
  assert(uploaded.status() === 200, `图书上传应成功：${JSON.stringify(uploadedBody)}`);
  await page.waitForURL(/\/books\/\d+$/, { timeout: 30000 });
  await page.waitForSelector('[data-testid="book-title"]');
  assert((await page.locator('[data-testid="book-title"]').textContent()).includes('共产党宣言'), '详情页应展示书名');
  await waitFor(
    async () =>
      page.evaluate(() => {
        const image = document.querySelector('.detail-cover');
        return Boolean(image && image.complete && image.naturalWidth > 0);
      }),
    '图书封面应加载成功',
  );
  await shot(page, 'book-detail');

  log('PDF 在线阅读：渲染、缩放、翻页...');
  await page.click('[data-testid="read-online"]');
  await page.waitForURL(/\/books\/\d+\/preview$/, { timeout: 20000 });
  await page.waitForSelector('[data-testid="pdf-canvas"]', { state: 'visible', timeout: 60000 });
  await waitFor(() => canvasHasContent(page), 'PDF 页面应渲染出可见内容', 60000);
  assert((await page.locator('[data-testid="page-indicator"]').textContent()).includes('1 / 2'), 'PDF 页码应为 1 / 2');
  const firstPageSnapshot = await page.evaluate(() =>
    document.querySelector('[data-testid="pdf-canvas"]')?.toDataURL(),
  );
  await page.click('[data-testid="pdf-next"]');
  await waitForText(page.locator('[data-testid="page-indicator"]'), '2 / 2', 20000);
  await waitFor(
    async () =>
      (await page.evaluate(() => document.querySelector('[data-testid="pdf-canvas"]')?.toDataURL())) !==
      firstPageSnapshot,
    'PDF 第 2 页应重新渲染',
    20000,
  );
  await waitFor(() => canvasHasContent(page), 'PDF 第 2 页应渲染出可见内容', 60000);
  await waitFor(async () => (await page.locator('.render-mask').count()) === 0, 'PDF 第 2 页渲染应完成');
  await page.click('[data-testid="pdf-zoom-in"]');
  await waitFor(async () => (await page.locator('.zoom-value').textContent()).includes('120%'), '缩放应变为 120%');
  await waitFor(async () => (await page.locator('.render-mask').count()) === 0, '缩放渲染应完成');
  await shot(page, 'reader-pdf');
  await page.click('.reader-back');
  await page.waitForURL(/\/books\/\d+$/, { timeout: 15000 });

  log('下载图书并检查附件名...');
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-testid="download-book"]');
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith('.pdf'), `下载文件应为 PDF，实际 ${download.suggestedFilename()}`);

  // 7. 上传 EPUB 并用 epub.js 阅读
  log('上传 EPUB 图书并在线阅读...');
  await page.click('[data-testid="header-upload"]');
  await page.waitForURL((url) => url.pathname === '/upload', { timeout: 15000 });
  await fillTestId(page, 'upload-title', '共产党宣言（EPUB）');
  await fillTestId(page, 'upload-author', '马克思 恩格斯');
  await page.setInputFiles('[data-testid="upload-input"]', epubZip);
  const epubUploadResponse = page.waitForResponse((response) => response.url().includes('/api/books/upload'), {
    timeout: 120000,
  });
  await page.click('[data-testid="upload-submit"]');
  assert((await epubUploadResponse).status() === 200, 'EPUB 上传应成功');
  await page.waitForURL(/\/books\/\d+$/, { timeout: 30000 });
  await page.click('[data-testid="read-online"]');
  await page.waitForURL(/\/books\/\d+\/preview$/, { timeout: 20000 });
  try {
    await page.waitForSelector('[data-testid="reader-epub"] iframe', { timeout: 20000 });
  } catch (error) {
    await shot(page, 'reader-epub-failure');
    const readerText = await page.locator('.reader-main').innerText().catch(() => '');
    const containerHtml = await page.locator('.epub-container').innerHTML().catch(() => '');
    console.error('[e2e] EPUB 阅读器未出现 iframe，页面内容：', readerText.slice(0, 1000));
    console.error('[e2e] epub 容器 HTML：', containerHtml.slice(0, 2000));
    console.error('[e2e] 控制台错误：', consoleErrors.slice(-20));
    console.error('[e2e] 页面异常：', pageErrors);
    throw error;
  }
  const epubFrame = page.frameLocator('[data-testid="reader-epub"] iframe');
  await waitFor(
    async () => {
      const text = await epubFrame.locator('body').textContent().catch(() => '');
      return Boolean(text && text.includes('资产者'));
    },
    'EPUB 第一章内容应渲染',
    60000,
  );
  await page.click('[data-testid="epub-next"]');
  await sleep(500);
  await shot(page, 'reader-epub');
  await page.click('.reader-back');
  await page.waitForURL(/\/books\/\d+$/, { timeout: 15000 });

  // 8. 图书库分类筛选
  log('检查图书库分类筛选...');
  await page.goto(`${webBase}/books`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="book-card"]');
  assert((await page.locator('[data-testid="book-card"]').count()) >= 2, '图书库应至少有两本书');
  await page.locator('[data-category="列宁著作"]').click();
  await waitFor(async () => (await page.locator('[data-testid="book-card"]').count()) === 0, '列宁著作分类应为空');
  await page.waitForSelector('.empty-state');
  await page.locator('[data-category="马恩著作"]').click();
  await page.waitForSelector('[data-testid="book-card"]');
  assert((await page.locator('[data-testid="book-card"]').count()) >= 2, '马恩著作分类应有两本书');
  await shot(page, 'books-library');

  // 9. 全局搜索
  log('检查搜索结果页与 Tab...');
  await page.goto(webBase, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer-trigger"]');
  await fillTestId(page, 'global-search-input', '共产党');
  await page.waitForSelector('[data-testid="search-panel"]');
  await waitForText(page.locator('[data-testid="search-panel"]'), '共产党宣言');
  const searchInput = page
    .locator('[data-testid="global-search-input"] input, input[data-testid="global-search-input"]')
    .first();
  await searchInput.press('Enter');
  await page.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === '共产党', {
    timeout: 15000,
  });
  await page.waitForSelector('[data-testid="search-book-grid"] .book-card');
  await searchInput.fill('同志');
  await sleep(400);
  await searchInput.press('Enter');
  await page.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === '同志', {
    timeout: 15000,
  });
  await page.locator('[data-testid="search-tab-users"]').click();
  await page.waitForSelector('[data-testid="search-user-list"]', { timeout: 20000 });
  assert((await page.locator('[data-testid="search-user-list"]').textContent()).includes(loginBody.user.nickname), '用户搜索应包含当前用户');
  await shot(page, 'search-results');

  // 10. 群聊与双人实时消息
  log('检查群聊与在线人数...');
  await page.goto(`${webBase}/chat`, { waitUntil: 'networkidle' });
  await waitForTestId(page, 'chat-input');
  await waitFor(async () => Number((await page.locator('[data-testid="chat-online-count"]').textContent()) || 0) >= 1, '至少一名用户在线');
  await fillTestId(page, 'chat-input', '同志们好，这是 E2E 自动化测试消息。');
  await page.click('[data-testid="chat-send"]');
  await waitForText(page.locator('[data-testid="chat-messages"]'), '同志们好，这是 E2E 自动化测试消息。');
  await shot(page, 'chat');

  const secondLogin = await apiLogin(`e2e-peer${Date.now()}@example.com`);
  const context2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  await context2.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('redlight_token', token);
      localStorage.setItem('redlight_user', JSON.stringify(user));
    },
    { token: secondLogin.token, user: secondLogin.user },
  );
  const page2 = await context2.newPage();
  await page2.goto(`${webBase}/chat`, { waitUntil: 'networkidle' });
  await waitForTestId(page2, 'chat-input');
  await waitFor(async () => Number((await page.locator('[data-testid="chat-online-count"]').textContent()) || 0) === 2, '两名用户在线');
  await fillTestId(page2, 'chat-input', '来自第二位同志的消息。');
  await page2.click('[data-testid="chat-send"]');
  await waitForText(page.locator('[data-testid="chat-messages"]'), '来自第二位同志的消息。');
  await shot(page, 'chat-two-users');
  await context2.close();

  // 11. 用户主页
  log('检查个人主页...');
  await page.goto(webBase, { waitUntil: 'networkidle' });
  await page.click('[data-testid="header-avatar"]');
  await page.waitForSelector('.ant-dropdown:not(.ant-dropdown-hidden)');
  const profileItem = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item').filter({ hasText: '个人主页' });
  await profileItem.first().click();
  await page.waitForURL(/\/profile\/\d+$/, { timeout: 15000 });
  await page.waitForSelector('[data-testid="profile-nickname"]');
  assert((await page.locator('[data-testid="profile-card"]').textContent()).includes(loginBody.user.nickname), '主页应展示昵称');
  await page.waitForSelector('[data-testid="profile-posts"] .post-card');
  await shot(page, 'profile');

  // 12. 修改昵称与头像
  log('修改昵称与头像...');
  await page.click('[data-testid="edit-profile"]');
  await waitForTestId(page, 'profile-edit-modal');
  await sleep(600);
  const newNickname = '赤光测试员';
  await fillTestId(page, 'profile-nickname-input', newNickname);
  const avatarUploadResponse = page.waitForResponse(
    (response) => response.url().includes('/api/upload/image') && response.request().method() === 'POST',
  );
  await page.setInputFiles('[data-testid="avatar-input"]', path.join(fixturesDir, 'cover.jpg'));
  assert((await avatarUploadResponse).status() === 200, '头像上传应成功');
  await waitFor(
    async () => (await page.locator('[data-testid="avatar-preview"] img').count()) > 0,
    '头像预览应显示',
  );
  await shot(page, 'profile-edit');
  const updateProfileResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/users/me') && response.request().method() === 'PATCH',
  );
  await page.click('[data-testid="profile-save"]');
  assert((await updateProfileResponse).status() === 200, '更新资料应成功');
  await waitFor(async () => (await page.locator('.ant-modal-wrap:visible').count()) === 0, '编辑资料弹窗应关闭');
  await waitForText(page.locator('[data-testid="profile-nickname"]'), newNickname);
  await waitFor(
    async () => {
      const avatar = page.locator('[data-testid="profile-card"] img').first();
      return (await avatar.count()) > 0 && (await avatar.evaluate((image) => image.complete && image.naturalWidth > 0));
    },
    '更新后的头像应显示',
  );
  await waitFor(
    async () => (await page.locator('[data-testid="app-header"] .avatar-btn img').count()) > 0,
    '顶栏头像应更新',
  );
  await waitForText(page.locator('[data-testid="profile-posts"] .post-card').first(), newNickname);
  await shot(page, 'profile-updated');

  // 13. 响应式三档
  log('检查 900px 两栏布局...');
  await page.goto(webBase, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 900, height: 800 });
  await sleep(300);
  const medium = await measureLayout(page);
  assert(medium.right.visible === false, '900px 应隐藏右边栏');
  assert(Math.abs(medium.side.width - 72) < 2, `900px 左导航应为 72px，实际 ${medium.side.width}`);
  assert(medium.mobileTab.visible === false, '900px 不应显示底部 Tab');
  assert(medium.overflow <= 1, `900px 不应横向溢出，溢出 ${medium.overflow}px`);
  await shot(page, 'responsive-900');

  log('检查 375px 单栏 + 底部 Tab...');
  await page.setViewportSize({ width: 375, height: 812 });
  await sleep(300);
  const narrow = await measureLayout(page);
  assert(narrow.side.visible === false, '375px 应隐藏左导航');
  assert(narrow.right.visible === false, '375px 应隐藏右边栏');
  assert(narrow.mobileTab.visible === true, '375px 应显示底部 Tab');
  assert(narrow.main.width <= 375 && narrow.main.width > 330, `375px 主内容应占满，实际 ${narrow.main.width}`);
  assert(narrow.overflow <= 1, `375px 不应横向溢出，溢出 ${narrow.overflow}px`);
  await shot(page, 'responsive-375');

  log('检查移动端搜索入口...');
  await page.click('[data-testid="mobile-search"]');
  await page.waitForURL((url) => url.pathname === '/search', { timeout: 15000 });
  await waitForTestId(page, 'search-page-input');
  await fillTestId(page, 'search-page-input', '共产党');
  await page.click('[data-testid="search-page-submit"]');
  await page.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === '共产党', {
    timeout: 15000,
  });
  await page.waitForSelector('[data-testid="search-book-grid"] .book-card');
  await shot(page, 'mobile-search');

  // 16. 提交举报并在门店后台查看
  log('提交举报并进入门店管理后台...');
  const reportResponse = await fetch(`${serverBase}/api/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secondLogin.token}` },
    body: JSON.stringify({
      targetType: 'post',
      targetId: postId,
      reason: '违法违规',
      detail: 'E2E 自动化举报：请管理员核实这条测试动态。',
    }),
  });
  const reportBody = await reportResponse.json();
  assert(reportResponse.ok, `提交举报应成功：${JSON.stringify(reportBody)}`);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${webBase}/store/1001`, { waitUntil: 'networkidle' });
  await waitForTestId(page, 'admin-gate-password');
  await fillTestId(page, 'admin-gate-password', 'redlight-admin-gate');
  await page.click('[data-testid="admin-gate-submit"]');
  await waitForTestId(page, 'admin-username');
  await fillTestId(page, 'admin-username', 'admin1001');
  await fillTestId(page, 'admin-password', 'Admin@12345');
  await page.click('[data-testid="admin-login-submit"]');
  await waitForTestId(page, 'admin-dashboard');
  await waitForText(page.locator('[data-testid="admin-report-list"]'), '自动化验收动态');
  assert((await page.locator('.admin-brand').textContent()).includes('一号门店'), '后台应显示门店名称');
  assert((await page.locator('[data-testid="admin-dashboard"]').textContent()).includes('待处理举报'), '后台应显示举报统计');
  await sleep(500);
  await shot(page, 'admin-dashboard');

  log('在后台下架被举报文章...');
  const reportActionResponse = page.waitForResponse(
    (response) => response.url().includes('/api/admin/reports/') && response.url().endsWith('/action'),
  );
  await page.click('[data-testid="admin-remove-target"]');
  await page.waitForSelector('.ant-modal-confirm', { state: 'visible' });
  await page.click('.ant-modal-confirm-btns .ant-btn-dangerous');
  assert((await reportActionResponse).status() === 200, '后台下架文章应成功');
  await waitForText(page.locator('[data-testid="admin-dashboard"]'), '暂无举报，社区秩序良好');
  await sleep(300);
  await shot(page, 'admin-report-handled');

  assert(pageErrors.length === 0, `页面存在未捕获异常：${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter(
    (text) => !text.includes('favicon') && !text.includes('Download the Vue Devtools'),
  );
  if (relevantConsoleErrors.length) {
    log(`控制台错误（${relevantConsoleErrors.length} 条，请人工确认）：\n${relevantConsoleErrors.join('\n')}`);
  }

  log('全部 E2E 步骤通过');
  const summary = {
    email,
    nickname: loginBody.user.nickname,
    screenshots: fs.readdirSync(screenshotsDir).sort(),
    consoleErrors: relevantConsoleErrors,
    pageErrors,
  };
  fs.writeFileSync(path.join(screenshotsDir, 'e2e-result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
  process.exitCode = 0;
} catch (error) {
  console.error('\n[e2e] 执行失败：', error);
  console.error('[e2e] 页面异常：', pageErrors);
  console.error('[e2e] 控制台错误（末尾）：', consoleErrors.slice(-20));
  for (const entry of children) {
    if (entry.lines.length) {
      console.error(`\n----- ${entry.name} 日志（末尾） -----`);
      console.error(entry.lines.join('').slice(-4000));
    }
  }
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  await stopAllChildren();
}
