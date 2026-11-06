# 赤光社 RedLight

> 一个面向马列主义爱好者的内容社区：邮箱验证码登录、类微博信息流、红色文献图书馆（ZIP 上传 / 解压 / 在线阅读）、全局搜索、实时群聊。

项目按 《马列主义爱好者社区-技术方案》实现，并完成了 `spec.md` / `tasks.md` / `checklist.md` 中约定的全部功能与自动化测试。

---

## 一、技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3 + Vite 7 + TypeScript + Pinia + Vue Router 4 + Ant Design Vue 4 + Axios |
| 阅读器 | PDF.js（PDF）+ epub.js（EPUB） |
| 实时通信 | Socket.IO 4（JWT 握手鉴权） |
| 后端 | Node.js + Express 4 + Socket.IO + Multer + adm-zip + Nodemailer + jsonwebtoken |
| 数据 | MySQL 8.0（部署目标）/ SQLite（本地零依赖）、Redis（可选，验证码与限流） |
| 部署 | Docker Compose + Nginx |

**本地零依赖模式**：`DB_DRIVER=sqlite`、不配置 Redis、不配置 SMTP 时，只需 Node.js 即可跑通登录 → 发帖 → 互动 → 上传 / 阅读 / 下载 → 搜索 → 群聊 → 个人主页全流程。

---

## 二、目录结构

```
赤光社/
├── client/                    # 前端
│   ├── src/
│   │   ├── api/               # Axios 接口封装
│   │   ├── components/        # 布局 / 帖子 / 图书 / 群聊 / 通用组件
│   │   ├── router/            # 路由与登录守卫
│   │   ├── stores/            # Pinia（auth / ui）
│   │   ├── styles/theme.css   # 红色设计 tokens 与全局样式
│   │   ├── utils/             # 时间、数字、富文本、防抖
│   │   └── views/             # Login / Home / Books / Reader / Chat / ...
│   ├── public/pdfjs/          # PDF.js cMap 与标准字体（中文 PDF 必需）
│   ├── Dockerfile
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/            # auth / posts / books / upload / search / chat / users / stats
│   │   ├── services/          # mailer / archive / cover / storage
│   │   ├── middleware/        # JWT、统一错误处理
│   │   ├── schema/            # mysql.sql / sqlite.sql
│   │   ├── app.js / db.js / cache.js / socket.js
│   │   └── index.js
│   ├── tests/                 # Vitest + Supertest + socket.io-client 集成测试
│   ├── Dockerfile
│   └── package.json
├── e2e/                       # Playwright Core 驱动本机 Edge 的端到端测试
│   ├── run-e2e.mjs
│   ├── fixtures/              # 测试用 PDF / EPUB / 封面
│   └── screenshots/           # 最近一次 E2E 截图（含 e2e-result.json）
├── scripts/
│   ├── dev.mjs                # 一键启动前后端
│   └── generate-fixtures.py   # 生成测试用 PDF / EPUB
├── server/scripts/show-logins.mjs  # 登录数据库查看工具
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── .dockerignore
├── DATABASE.md                # 登录数据库使用指南
├── RELEASE_NOTES.md           # v1.0.0 发布说明与本地完整运行指南
├── TEST-REPORT.md             # 验收报告（对照 checklist.md）
└── README.md
```

---

## 三、快速开始（本地 SQLite，无需 Docker / MySQL / Redis / SMTP）

环境要求：**Node.js ≥ 20.19**（已在 Node 24.21 验证）。

```powershell
cd 赤光社
npm run install:all
Copy-Item .env.example .env   # Windows PowerShell；也可不复制，使用默认值
npm run dev
```

启动后：

- 前端：<http://127.0.0.1:5173>
- 后端健康检查：<http://127.0.0.1:3000/api/health> → `{"ok":true,"driver":"sqlite"}`

登录与注册已分开：

- **注册**：邮箱验证码 + 自定义用户名 ID（4–20 位中文、字母、数字或下划线，不能包含特殊符号），昵称默认与 ID 相同，并自动生成唯一 6 位社区号。
- **登录**：仅允许已注册邮箱；未注册邮箱会提示先注册，不再自动建号。
- 用户名 ID 用于加好友与身份识别，注册后不可修改；社区号用于数据库查询，可在个人主页点击复制。
- 未配置 SMTP 时，**验证码会打印在后端控制台**，登录页在开发模式下也会显示 `本地开发模式验证码：xxxxxx`。

登录后可以点击右上角头像菜单的「编辑资料」，或在个人主页点击「编辑资料」，修改昵称与头像（头像支持 JPG / PNG / GIF / WebP，≤5MB）。

也可分别启动：

```powershell
# 终端 1
cd server
npm install
npm run dev

# 终端 2
cd client
npm install
npm run dev
```

默认数据位置：

- SQLite：`server/data/redlight.db`（首次启动自动建表）
- 上传文件：`server/uploads/`（`books/`、`images/`、`temp/`）
- 上传默认上限：图片 5MB、图书 ZIP 100MB

---

## 查看登录数据库（SQL）

所有登录尝试（成功 / 失败）都会写入 SQL 表 `login_logs`，并提供 `login_log_details`（可读明细）与 `login_stats_daily`（按天统计）两个视图。

```powershell
# 最近 20 条登录记录
npm run logins

# 只看失败记录、按邮箱筛选、附带按天统计
npm run logins -- --status fail
npm run logins -- --email reader@example.com
npm run logins -- --stats
```

SQLite 文件位置：`server/data/redlight.db`。完整字段说明、图形工具、常用 SQL、MySQL / Docker 查询和备份方法见 **[DATABASE.md](DATABASE.md)**。

---

## 四、SMTP 邮件配置（可选）

本地不配置 SMTP 时，验证码会输出到控制台，方便联调。要真实发信，编辑 `.env`：

```ini
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@qq.com
SMTP_PASS=你的SMTP授权码
SMTP_FROM=赤光社 <your_email@qq.com>
```

> QQ 邮箱获取授权码：邮箱网页版 →「设置」→「账户」→ 开启「POP3/SMTP 服务」→ 生成授权码。**授权码不是邮箱登录密码**，请勿提交到 Git。
>
> 生产环境未配置 SMTP 时，`POST /api/auth/send-code` 会返回 503，而不是静默失败。

---

## 五、MySQL 部署

1. 创建数据库并导入 schema：

   ```bash
   mysql -u root -p -e "CREATE DATABASE redlight DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   mysql -u root -p redlight < server/src/schema/mysql.sql
   ```

   > 从 v1.0.0 及更早版本升级已有 MySQL 数据库（缺少 `username` / `community_no` 字段）时，先执行一次：
   > `mysql -u root -p redlight < server/src/schema/migrations/001_user_identity.sql`

2. 修改 `.env`：

   ```ini
   DB_DRIVER=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=你的密码
   DB_NAME=redlight
   REDIS_URL=redis://127.0.0.1:6379   # 可选
   ```

3. 重启后端。

**中文全文检索说明**：`books` 表使用 `FULLTEXT ... WITH PARSER ngram`，MySQL 5.7.6+ 自带 ngram，无需安装插件；建议使用 MySQL 8.0。ngram 默认 `ngram_token_size=2`，所以单字搜索可能无结果，**请使用两个及以上汉字**（如「共产党」「资本论」）。SQLite 本地模式自动回退为 `LIKE` 模糊匹配，支持单字。

---

## 六、Docker Compose 一键部署

```powershell
cd 赤光社
Copy-Item .env.example .env
# 修改 .env 中的 JWT_SECRET、DB_PASSWORD、SMTP_*；可选 WEB_PORT / API_PORT
docker compose up -d --build
```

访问 <http://localhost>（默认 80 端口，可通过 `WEB_PORT` 修改）。

服务组成：

| 服务 | 说明 |
| --- | --- |
| `mysql` | MySQL 8.0，首次启动自动执行 `server/src/schema/mysql.sql`，数据卷 `mysql_data` |
| `redis` | Redis 7，验证码 / 限流缓存，数据卷 `redis_data` |
| `backend` | Node 22 + Express + Socket.IO，端口 3000，上传目录挂载 `uploads_data` |
| `frontend` | Nginx 托管前端静态资源，代理 `/api`、`/uploads`、`/socket.io`，`client_max_body_size 100M` |

注意事项：

- 修改 schema 后若 MySQL 数据卷已初始化，需要 `docker compose down -v` 再启动才能重新执行建表脚本。
- 生产环境务必设置强随机 `JWT_SECRET` 与数据库密码。
- 容器内 `CORS_ORIGIN` 默认 `*`；若前后端同域部署（默认 Nginx 代理），可保持默认。

---

## 七、测试

### 1. 后端集成测试（Vitest + Supertest + Socket.IO Client）

```powershell
npm run test:server
```

覆盖：健康检查、双 schema 字段一致性、验证码 6 位 / 5 分钟 / 60 秒限流、登录日志（成功 / 失败 / IP / UA）、自动注册与 7 天 JWT、401、发帖 1000 字 / 9 图限制、信息流倒序分页、点赞幂等、评论计数、转发引用、ZIP 安全解压（路径穿越 / 可执行文件 / 无 PDF / 体积限制 / 清理）、封面提取（PDF 渲染 + EPUB 内置封面）、下载计数、搜索分页 / 分类 / 中文、群聊鉴权 / 广播 / 在线统计 / 历史上翻、用户主页、热榜缓存、社区统计。

### 2. 前端单元测试（Vitest + Vue Test Utils + happy-dom）

```powershell
npm run test:client
```

覆盖：数字 / 时间格式化（含「万」）、XSS 转义与话题高亮、300ms 防抖、auth store、PostCard 点赞 / 评论展开 / 转发引用、GlobalSearch 防抖与回车跳转。

### 3. 端到端测试（Playwright Core + 本机 Microsoft Edge）

```powershell
npm run e2e
```

脚本会自行在 3101 / 5188 端口启动后端（临时 SQLite）与 Vite，使用无头 Edge 执行：

登录守卫 → 邮箱验证码注册（自定义 ID / 社区号）→ 三栏布局与配色断言 → 发帖 → 点赞 / 评论 / 转发 → ZIP 上传 PDF → 在线阅读 / 缩放 / 下载 → ZIP 上传 EPUB → epub.js 阅读 → 图书库分类 → 全局搜索 / Tab → 群聊（双用户实时消息）→ 个人主页 → 修改昵称 / 上传头像 → 900px / 375px 响应式断言。

截图与结果保存在 `e2e/screenshots/`（含 `e2e-result.json`）。

> E2E 依赖本机已安装 Microsoft Edge；若使用其他路径，可修改 `e2e/run-e2e.mjs` 中的 `channel`。测试使用独立临时数据库，不会污染本地数据。

### 4. 生产构建校验

```powershell
npm run build
```

> Windows 受限环境下 Vite/esbuild 需要可用的临时目录；如遇 `spawn EPERM` 或 Temp 清理失败，请给终端完整文件权限，或将 `TEMP` / `TMP` 指向项目内目录后重试。

---

## 八、主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/send-code` | 发送 6 位验证码（`purpose=login/register`，60 秒限流） |
| POST | `/api/auth/register` | 邮箱验证码注册（自定义用户名 ID，自动生成社区号） |
| POST | `/api/auth/login` | 已注册邮箱登录，返回 7 天 JWT |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/posts?page&size` | 信息流倒序分页 |
| POST | `/api/posts` | 发帖（≤1000 字、≤9 图） |
| POST | `/api/posts/:id/like` | 点赞 / 取消（幂等） |
| GET/POST | `/api/posts/:id/comments` | 评论列表 / 发表评论 |
| POST | `/api/posts/:id/repost` | 转发（写 `repost_id`） |
| POST | `/api/upload/image` | 图片上传（≤5MB） |
| POST | `/api/books/upload` | 图书 ZIP 上传（≤100MB，字段 `zipFile`） |
| GET | `/api/books?category&page&size` | 图书库 |
| GET | `/api/books/:id` | 图书详情 |
| GET | `/api/books/:id/file` | 在线阅读流（inline） |
| GET | `/api/books/:id/download` | 下载附件，`download_count` +1 |
| GET | `/api/search?q` | 综合搜索（图书 / 用户各 5 条） |
| GET | `/api/search/books?q&category&page` | 图书搜索分页 |
| GET | `/api/search/users?q&page` | 用户搜索分页 |
| GET | `/api/chat/history?beforeId&limit` | 群聊历史（默认最近 50 条） |
| GET | `/api/users/:id?page&size` | 用户资料 + 帖子分页 |
| PATCH | `/api/users/me` | 修改当前用户昵称 / 头像 |
| GET | `/api/stats/hot-topics` | 近 500 帖话题热榜（缓存 60 秒） |
| GET | `/api/stats/community` | 社区数据 |
| GET | `/api/stats/online` | 在线用户 |

Socket.IO：连接时 `auth.token` 携带 JWT；发送 `chat:send` `{ type: 1|2, content }`；接收 `chat:message`、`chat:online`、`chat:error`、`chat:ready`。

错误响应统一为 `{ "msg": "可读的错误原因" }` 与对应 HTTP 状态码。

---

## 九、设计与安全

**设计 tokens**：主色 `#C8102E`、深红 `#8B0000`、金色 `#D4AF37`、页面背景 `#FAF8F5`、正文 `#2C2C2C`、次要文字 `#8C8C8C`；卡片 8px 圆角、按钮 6px 圆角、`0 2px 8px rgba(0,0,0,0.06)` 轻阴影、8px 栅格；红色只做强调，不大面积铺满。

**三档响应式**：≥1200px 三栏（200 / 680 / 280）；768–1199px 两栏（左导航收窄为 72px 图标）；<768px 单栏 + 底部 Tab。

**安全措施**：

- 邮箱验证码存于 Redis / 内存 TTL（5 分钟），60 秒限流，登录成功即失效；
- 每次登录尝试（含失败）写入 `login_logs`（邮箱、IP、UA、状态）；
- JWT 7 天有效期，写接口统一 401；
- ZIP 上传校验魔数、路径穿越（`../` / 绝对路径 / 符号链接）、可执行文件、条目数（2000）、解压体积（500MB）、压缩比（zip bomb），异常时清理临时 ZIP 与解压目录；
- 上传大小限制：图片 5MB、ZIP 100MB（后端 Multer + Nginx `client_max_body_size` 双重限制）；
- 帖子正文先 HTML 转义再渲染话题 / @，避免 XSS；
- 图书文件路径限制在 `uploads/` 内，禁止任意文件读取。

**版权提示**：请上传公有领域或已获授权的马列原著文献；请勿上传受版权保护且未获授权的电子书。本项目仅用于学习交流。

---

## 十、常见问题

1. **验证码收不到**：未配置 SMTP 时看后端控制台；开发模式登录页也会显示 `devCode`。配置 SMTP 后请检查授权码、端口 465 与 `SMTP_SECURE=true`。
2. **中文搜索无结果（MySQL）**：确认 `books` 表使用 `WITH PARSER ngram` 且 MySQL ≥ 5.7.6；关键词至少 2 个汉字。
3. **PDF 中文乱码 / 缺字**：`client/public/pdfjs/cmaps` 与 `standard_fonts` 已随项目提供，请勿删除；若替换 PDF.js 版本需同步更新这两个目录。
4. **端口被占用**：修改 `.env` 中 `PORT`，并同步设置前端 `VITE_PROXY_TARGET`；Vite 端口可用 `npm run dev -- --port 5174`。
5. **E2E 无法启动浏览器**：确认 Microsoft Edge 已安装；脚本使用 `channel: 'msedge'`，不会下载额外浏览器。
6. **Docker 首次启动 MySQL 很慢**：等待 healthcheck 通过；如 schema 未执行，检查 `docker compose logs mysql`。

---

## 十一、版本发布

当前版本：**v1.0.0**。

- 完整发布说明（功能清单、环境依赖、本地运行全部功能的命令、Docker、测试、环境变量）：[RELEASE_NOTES.md](RELEASE_NOTES.md)
- 验收结果：[TEST-REPORT.md](TEST-REPORT.md)
- 登录数据库使用：[DATABASE.md](DATABASE.md)

---

> 为了新世界，学习理论，团结同志。
