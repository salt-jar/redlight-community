# 赤光社 RedLight v1.0.0

> 马列主义爱好者的内容社区：邮箱验证码登录、类微博信息流、红色文献图书馆、全局搜索、实时群聊。
>
> 发布分支：`main`　·　版本：`v1.0.0`　·　日期：2026-11-06

---

## 一、这个版本包含什么

- **邮箱验证码登录**：6 位验证码、5 分钟有效、同邮箱 60 秒限流；JWT 有效期 7 天；每次登录尝试（含失败）写入 `login_logs`（邮箱、IP、UA、状态）。
- **类微博信息流**：1000 字 / 最多 9 图发布、倒序分页、骨架屏、无限滚动、到底提示、空状态、下拉刷新 / 回到顶部。
- **互动**：点赞（幂等，>9999 显示「万」）、卡片内评论、转发并展示原帖引用。
- **图书库**：ZIP 上传（≤100MB）、安全解压、路径穿越 / 可执行文件 / zip bomb 防护、PDF 首页渲染封面、EPUB 内置封面、失败占位封面。
- **在线阅读**：PDF.js（翻页、缩放）、epub.js（章节切换）；下载计数。
- **全局搜索**：300ms 防抖下拉、图书 / 用户分组、`/search` 结果页「全部 / 图书 / 用户」Tab 与分页。
- **Socket.IO 群聊**：JWT 握手鉴权、文字 / 图片消息、最近 50 条、上滑历史、在线人数与列表。
- **用户主页 / 热榜 / 社区数据**：真实统计、热榜 60 秒缓存并在发帖后失效。
- **登录数据库工具**：`login_log_details`、`login_stats_daily` 视图，以及 `npm run logins` 命令行查看器。
- **响应式**：≥1200px 三栏、768–1199px 两栏、<768px 单栏 + 底部 Tab；移动端保留搜索入口。
- **部署**：Docker Compose（MySQL 8 + Redis 7 + 后端 + Nginx 前端）、Nginx 100M 上传限制、`.env.example`、README、验收报告。

---

## 二、环境依赖

### 必需（本地 SQLite 零依赖模式）

| 依赖 | 版本要求 | 验证版本 |
| --- | --- | --- |
| Node.js | ≥ 20.19 | 24.21.0 |
| npm | ≥ 10 | 11.19.0 |

> 只需 Node.js 即可运行全部功能：SQLite 自动建表、缓存使用进程内 TTL、验证码打印到控制台。

### 可选（按需启用）

| 依赖 | 用途 | 说明 |
| --- | --- | --- |
| MySQL | 生产数据库 | ≥ 8.0，使用 `FULLTEXT ... WITH PARSER ngram` 支持中文搜索 |
| Redis | 验证码 / 限流跨进程缓存 | 设置 `REDIS_URL` 即启用；未配置自动回退内存 |
| SMTP（QQ / 163 等） | 真实发送验证码邮件 | 未配置时为 console 模式，开发环境接口返回 `devCode` |
| Docker + Compose v2 | 一键部署 | 可选；本机无 Docker 时按 README 静态校验 |
| Microsoft Edge | 仅 E2E 测试 | `playwright-core` 驱动本机 Edge，不额外下载浏览器 |

**不需要**：Java、Python、Visual Studio、全局安装的 MySQL 客户端；`better-sqlite3`、`@napi-rs/canvas` 会随 npm 安装。

---

## 三、本地运行全部功能（推荐）

```powershell
git clone https://github.com/salt-jar/redlight-community.git
cd redlight-community

# 1. 安装依赖（前端 + 后端 + E2E）
npm run install:all

# 2. 生成本地配置（Windows PowerShell）
Copy-Item .env.example .env
# macOS / Linux: cp .env.example .env

# 3. 一键启动后端 + 前端
npm run dev
```

打开：

- 前端：<http://127.0.0.1:5173>
- 后端健康检查：<http://127.0.0.1:3000/api/health> → `{"ok":true,"driver":"sqlite"}`

登录：输入任意合法邮箱 → 点击「获取验证码」→ **开发模式下验证码显示在登录页**，同时打印在后端控制台；登录后自动注册。

### 可选配置

编辑 `.env`：

```ini
# 真实发信（QQ 邮箱示例）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@qq.com
SMTP_PASS=你的SMTP授权码
SMTP_FROM=赤光社 <your_email@qq.com>

# Redis（可选）
REDIS_URL=redis://127.0.0.1:6379

# MySQL（可选；默认 sqlite）
DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=redlight
```

MySQL 模式需先导入 schema：

```bash
mysql -u root -p -e "CREATE DATABASE redlight DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p redlight < server/src/schema/mysql.sql
```

### 登录数据库查看

```powershell
npm run logins                 # 最近 20 条
npm run logins -- --stats      # 按天统计
npm run logins -- --status fail
npm run logins -- --json
```

SQLite 位置：`server/data/redlight.db`（已加入 `.gitignore`，不会上传）。完整说明见 `DATABASE.md`。

---

## 四、Docker Compose 启动

```powershell
Copy-Item .env.example .env
# 修改 .env 中 JWT_SECRET / DB_PASSWORD / SMTP_*（可选）
docker compose up -d --build
```

访问 <http://localhost>（默认 80；可用 `WEB_PORT` 调整）。

服务：`mysql`（8.0，自动导入 schema）、`redis`（7-alpine）、`backend`（Node 22）、`frontend`（Nginx）。
上传限制：Nginx `client_max_body_size 100M` 与后端 Multer 双重限制。

---

## 五、测试与构建命令

```powershell
npm run test:server   # 后端 52 个用例
npm run test:client   # 前端 21 个用例
npm run e2e           # Playwright + 本机 Edge，13 张截图
npm run build         # vue-tsc 类型检查 + Vite 生产构建
```

测试证据：`e2e/screenshots/`；验收报告：`TEST-REPORT.md`。

---

## 六、环境变量

| 变量 | 本地默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端端口 |
| `JWT_SECRET` | 开发默认值 | **生产必须替换为强随机字符串** |
| `DB_DRIVER` | `sqlite` | `sqlite` / `mysql` |
| `DB_FILE` | `data/redlight.db` | SQLite 文件（相对 `server/`） |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | — | MySQL 连接 |
| `REDIS_URL` | 空 | 空 = 进程内缓存 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | 空 | 空 = console 模式 |
| `UPLOAD_DIR` | `uploads` | 上传目录（相对 `server/`） |
| `CORS_ORIGIN` | `*` | 生产建议改为实际域名 |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:3000` | Vite 开发代理目标 |
| `WEB_PORT` / `API_PORT` | `80` / `3000` | 仅 Docker Compose |

完整模板见 `.env.example`。

---

## 七、不会上传的文件

仓库已通过 `.gitignore` 排除：

- `node_modules/`、构建产物 `dist/`、Vite 缓存；
- `server/data/`（SQLite 数据库及 WAL/SHM）；
- `server/uploads/`（用户上传的图书、图片、临时 ZIP）；
- `.env` / `.env.local`（SMTP 授权码、JWT 密钥、数据库密码）；
- 测试临时目录、日志、系统文件。

不要将 `.env`、数据库文件或 SMTP 授权码提交到 GitHub。

---

## 八、已知限制

- 本版本在 Windows + Node 24.21 + SQLite 下完成全流程实测；MySQL / Redis / SMTP / Docker 代码与配置已实现，但发布环境未实际启动这些外部服务，相关分支以 schema 一致性、配置静态校验与降级测试覆盖。
- MySQL 中文全文检索依赖 `ngram`，建议 MySQL 8.0；单字搜索可能无结果，请用两个及以上汉字。
- EPUB / PDF 阅读使用浏览器端 PDF.js / epub.js，超大文件加载时间取决于网络与浏览器内存。
- AI 生成内容与用户上传文献仅用于学习交流；请确保上传文献属于公有领域或已获授权。

---

## 九、快速验证清单

1. `npm run dev` 后 `/api/health` 返回 `{"ok":true,"driver":"sqlite"}`；
2. 登录页获取验证码并登录成功；
3. 发帖、点赞、评论、转发；
4. 上传 ZIP（含 PDF / EPUB）并在线阅读、下载；
5. 搜索书名 / 昵称；
6. 两个浏览器会话互发群聊消息；
7. 打开个人主页与右侧栏统计；
8. 调整窗口到 900px / 375px 检查响应式。

---

> 为了新世界，学习理论，团结同志。
