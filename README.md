# 赤光社 RedLight

> 一个面向马列主义爱好者的内容社区：邮箱验证码登录、类微博信息流、红色文献图书馆（ZIP 上传 / 解压 / 在线阅读）、全局搜索、实时群聊，以及组织 001 管理后台和 SQL 开发者管理系统。

项目按 《马列主义爱好者社区-技术方案》实现，并完成了 `spec.md` / `tasks.md` / `checklist.md` 中约定的全部功能与自动化测试；后续已加入注册 / 登录拆分、用户名 ID / 社区号、组织后台、举报治理、用户封锁和统一二级页面布局。

## 最近更新（main）

- 登录与注册分离：注册自定义用户名 ID，自动生成 6 位社区号；
- 首页「大字报」：按时间顺序展示全部用户动态；
- 群聊支持 `@所有人`，每位成员每周最多 3 次；
- 群聊右侧功能栏：提案预览、提案详情面板、发起提案表单；
- 组织 001 后台：SQL 系统设置密码 + 组织管理员个人密码两级验证；
- `/sql` SQL 开发者管理系统：密码 `1111`，可管理组织、组织管理员和系统设置；
- 举报文章 / 图书；后台可下架 / 恢复、封锁 / 解除用户；
- 用户封锁后：登录与写接口拒绝，文章 / 图书 / 主页 / 搜索 / 群聊历史隐藏，已登录前端自动退出；
- 二级页面统一 1080px 内容宽度、26px 卡片内边距；标准弹窗统一 22/26px 内边距，修复内容贴边。

---

## 一、技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3 + Vite 7 + TypeScript + Pinia + Vue Router 4 + Ant Design Vue 4 + Axios |
| 阅读器 | PDF.js（PDF）+ epub.js（EPUB） |
| 实时通信 | Socket.IO 4（JWT 握手鉴权） |
| 后端 | Node.js + Express 4 + Socket.IO + Multer + adm-zip + Nodemailer + jsonwebtoken + scrypt |
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
│   │   ├── components/        # 布局 / 帖子 / 图书 / 群聊 / 举报弹窗 / 通用组件
│   │   ├── router/            # 路由与登录守卫
│   │   ├── stores/            # Pinia（auth / ui）
│   │   ├── styles/theme.css   # 设计 tokens、二级页面与弹窗布局规范
│   │   ├── utils/             # 时间、数字、富文本、防抖
│   │   └── views/             # Login / Home / Books / Reader / Chat / AdminPortal / ...
│   ├── public/pdfjs/          # PDF.js cMap 与标准字体（中文 PDF 必需）
│   ├── Dockerfile
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/            # auth / posts / books / search / chat / proposals / users / stats / reports / admin
│   │   ├── services/          # mailer / archive / cover / storage
│   │   ├── middleware/        # JWT、管理员 JWT、统一错误处理
│   │   ├── schema/            # mysql.sql / sqlite.sql + migrations/
│   │   ├── utils/             # identity / password / serialize
│   │   ├── app.js / db.js / cache.js / socket.js
│   │   └── index.js
│   ├── scripts/
│   │   ├── show-logins.mjs    # 登录数据库查看工具
│   │   └── create-org-admin.mjs # 创建 / 重置组织管理员
│   ├── tests/                 # Vitest + Supertest + socket.io-client 集成测试
│   ├── Dockerfile
│   └── package.json
├── e2e/                       # Playwright Core 驱动本机 Edge 的端到端测试
│   ├── run-e2e.mjs
│   ├── fixtures/              # 测试用 PDF / EPUB / 封面
│   └── screenshots/           # 最近一次 E2E 截图（含 e2e-result.json）
├── scripts/
│   ├── dev.mjs                # 一键启动前后端（后端 --watch）
│   └── generate-fixtures.py   # 生成测试用 PDF / EPUB
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

`npm run dev` 会同时启动后端（带 `--watch`，代码变更自动重载）和前端 Vite。

启动后：

- 前端：<http://127.0.0.1:5173>
- 后端健康检查：<http://127.0.0.1:3000/api/health> → `{"ok":true,"driver":"sqlite"}`

登录与注册已分开：

- **注册**：邮箱验证码 + 自定义用户名 ID（4–20 位中文、字母、数字或下划线，不能包含特殊符号），昵称默认与 ID 相同，并自动生成唯一 6 位社区号。
- **登录**：仅允许已注册邮箱；未注册邮箱会提示先注册，不再自动建号。
- 用户名 ID 用于加好友与身份识别，注册后不可修改；社区号用于数据库查询，可在个人主页点击复制。
- 未配置 SMTP 时，**验证码会打印在后端控制台**，登录页在开发模式下也会显示 `本地开发模式验证码：xxxxxx`。

登录后可以点击右上角头像菜单的「编辑资料」，或在个人主页点击「编辑资料」，修改昵称与头像（头像支持 JPG / PNG / GIF / WebP，≤5MB）。

### 组织与 SQL 管理后台

#### 1. 组织管理后台（001）

入口：<http://127.0.0.1:5173/org/001>

组织后台需要两级验证：

1. **组织系统密码**：001 组织第一级密码，保存在数据库 `system_settings` 表；初始化值为 `SQL`，实际值以数据库当前值为准；
2. **组织管理员个人密码**：管理员账号 + scrypt 哈希密码。

查看 / 修改 001 系统密码（可直接用 SQL）：

```sql
-- 查看当前值
SELECT setting_key, value
FROM system_settings
WHERE setting_key = 'org.001.gate_password';

-- 修改
UPDATE system_settings
SET value = '新的组织系统密码'
WHERE setting_key = 'org.001.gate_password';
```

修改后立即生效，不需要重启后端。SQL 开发者系统的「系统设置」页面也可以修改。

创建 / 重置组织管理员：

```powershell
npm run admin:create -- --org 001 --username admin001 --password "至少8位个人密码" --name "组织管理员"
```

也可以设置 `ORG_ADMIN_BOOTSTRAP_PASSWORD` 后首次启动自动创建 `admin001`。

#### 2. SQL 开发者管理系统

入口：<http://127.0.0.1:5173/sql>

- 密码：`1111`（通过 `SQL_ADMIN_PASSWORD` 修改）；
- 权限更高：在组织后台的文章 / 图书 / 用户 / 举报管理之外，还可以查看和管理组织、组织管理员、系统设置；
- 可直接在「系统设置」中修改组织 001 的第一级系统密码。

后台支持：

- 接收用户对**文章 / 图书**的举报；
- 下架 / 恢复文章、图书；
- 封锁 / 解除封锁用户（封锁后登录、发帖、评论、点赞、群聊均被拒绝，文章 / 图书 / 个人主页 / 搜索结果 / 群聊历史不再对普通用户展示）；
- 查看全站文章、图书、用户和统计。

> 当前社区内容为全站共享：001 组织后台与 SQL 开发者系统共享同一份内容、举报队列；组织管理员只能进入组织后台，SQL 开发者系统拥有组织和系统设置权限。
>
> 管理员个人密码只保存 scrypt 哈希和随机盐；组织系统密码保存在 SQL 系统设置中，请部署时立即修改。

### 群聊：@所有人 / 提案

- 群聊输入框上方有 `@所有人` 按钮，点击插入提及；**每位成员每周最多使用 3 次**，达到上限后按钮禁用，服务端仍会二次校验；
- 每周从周一 00:00 重新计数，使用记录在 `chat_at_all_usage` 表；
- 群聊页面左侧保留空白边距，右侧增加功能栏，第一个选项为「提案」；
- 功能栏内直接以小卡片预览提案标题、发起人与提案时间，无需打开面板即可看到条目；
- 点击「提案」后主聊天区向左收缩，右侧展开提案详情面板；
- 提案表单字段：**提案标题、提案时间、发起人信息、提案正文**，发起人信息会根据当前账号预填，也可修改；
- 提案数据保存在 `proposals` 表，接口为 `GET/POST /api/proposals`。

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

   > 从 v1.0.0 及更早版本升级已有 MySQL 数据库（缺少 `username` / `community_no` 字段）时，按顺序执行：
   > `001_user_identity.sql` → `002_admin.sql` → `003_organization_sql.sql` → `004_proposals_at_all.sql`。

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

- 修改 schema 后若 MySQL 数据卷已初始化，需要 `docker compose down -v` 再启动才能重新执行建表脚本；生产数据请改用 `server/src/schema/migrations/` 下的迁移脚本。
- 首次部署可在 `.env` 设置 `ORG_ADMIN_BOOTSTRAP_PASSWORD` 自动创建组织 001 管理员 `admin001`；也可在容器内执行：
  `docker compose exec backend node scripts/create-org-admin.mjs --org 001 --username admin001 --password "强密码" --name "组织管理员"`。
- 生产环境务必设置强随机 `JWT_SECRET`、`SQL_ADMIN_PASSWORD` 与数据库密码，并修改组织系统密码。
- 容器内 `CORS_ORIGIN` 默认 `*`；若前后端同域部署（默认 Nginx 代理），可保持默认。

---

## 七、测试

### 1. 后端集成测试（Vitest + Supertest + Socket.IO Client）

```powershell
npm run test:server
```

覆盖：健康检查、双 schema 字段一致性、验证码 6 位 / 5 分钟 / 60 秒限流、登录日志（成功 / 失败 / IP / UA）、注册 / 登录分离、自定义用户名 ID 与社区号、7 天 JWT、401、发帖 1000 字 / 9 图限制、信息流倒序分页、点赞幂等、评论计数、转发引用、ZIP 安全解压（路径穿越 / 可执行文件 / 无 PDF / 体积限制 / 清理）、封面提取（PDF 渲染 + EPUB 内置封面）、下载计数、搜索分页 / 分类 / 中文、群聊鉴权 / 广播 / 在线统计 / 历史上翻 / `@所有人` 每周额度、提案创建 / 列表 / 详情 / 校验、用户主页、热榜缓存、社区统计、组织两级密码、SQL 开发者高权限系统、举报处理、文章 / 图书 / 用户状态管理、封锁后内容隐藏与解除恢复。

当前结果：**10 个测试文件 / 70 个用例全部通过**。

### 2. 前端单元测试（Vitest + Vue Test Utils + happy-dom）

```powershell
npm run test:client
```

覆盖：数字 / 时间格式化（含「万」）、XSS 转义与话题高亮、300ms 防抖、auth store、PostCard 点赞 / 评论展开 / 转发引用、GlobalSearch 防抖与回车跳转。

当前结果：**6 个测试文件 / 21 个用例全部通过**。

### 3. 端到端测试（Playwright Core + 本机 Microsoft Edge）

```powershell
npm run e2e
```

脚本会自行在 3101 / 5188 端口启动后端（临时 SQLite）与 Vite，使用无头 Edge 执行：

登录守卫 → 邮箱验证码注册（自定义 ID / 社区号）→ 大字报/三栏布局与配色断言 → 发帖 → 点赞 / 评论 / 转发 → ZIP 上传 PDF → 在线阅读 / 缩放 / 下载 → ZIP 上传 EPUB → epub.js 阅读 → 图书库分类 → 全局搜索 / Tab → 群聊（双用户实时消息、@所有人额度、提案表单与右侧面板）→ 个人主页 → 修改昵称 / 上传头像 → 900px / 375px 响应式断言 → 二级页面宽度 / 卡片内边距断言 → 提交举报 → 组织后台两级验证 → 查看举报并下架文章 → 后台封锁 / 解除封锁用户 → SQL 开发者系统（1111）高权限页面 → 举报弹窗内边距检查 → 提案栏最终展示。

当前结果：**20 张截图，0 页面异常，0 控制台错误**。

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
| POST | `/api/reports` | 举报文章 / 图书 |
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
| GET | `/api/chat/at-all` | 当前用户本周 @所有人 使用额度 |
| GET | `/api/proposals?limit` | 提案列表（含发起人信息） |
| GET | `/api/proposals/:id` | 提案详情 |
| POST | `/api/proposals` | 发起提案（标题 / 提案时间 / 发起人信息 / 正文） |
| GET | `/api/users/:id?page&size` | 用户资料 + 帖子分页 |
| PATCH | `/api/users/me` | 修改当前用户昵称 / 头像 |
| GET | `/api/stats/hot-topics` | 近 500 帖话题热榜（缓存 60 秒） |
| GET | `/api/stats/community` | 社区数据 |
| GET | `/api/stats/online` | 在线用户 |
| POST | `/api/admin/orgs/:orgCode/unlock` | 组织后台第一级系统密码验证（密码来自 SQL 系统设置） |
| POST | `/api/admin/orgs/:orgCode/login` | 组织管理员个人密码登录，返回 2 小时管理员 JWT |
| POST | `/api/admin/sql/login` | SQL 开发者管理系统登录（默认 `1111`） |
| GET | `/api/admin/me` | 当前管理员与组织信息 |
| GET | `/api/admin/stats` | 后台统计 |
| GET | `/api/admin/reports?status=0` | 举报列表 |
| POST | `/api/admin/reports/:id/action` | 处理举报：下架文章 / 图书、封锁作者、忽略 |
| GET/POST | `/api/admin/posts`、`/api/admin/posts/:id/status` | 文章管理 / 上下架 |
| GET/POST | `/api/admin/books`、`/api/admin/books/:id/status` | 图书管理 / 上下架 |
| GET/POST | `/api/admin/users`、`/api/admin/users/:id/status` | 用户管理 / 封锁 |
| GET | `/api/admin/orgs/:orgCode/public` | 组织入口公开信息 |
| GET | `/api/admin/organizations` | SQL 开发者专属：组织列表 |
| GET/POST | `/api/admin/organization-admins` | SQL 开发者专属：组织管理员列表 / 创建重置 |
| GET/PUT | `/api/admin/settings`、`/api/admin/settings/:key` | SQL 开发者专属：系统设置（含组织一级密码） |

Socket.IO：连接时 `auth.token` 携带 JWT；发送 `chat:send` `{ type: 1|2, content }`；接收 `chat:message`、`chat:online`、`chat:error`、`chat:ready`。

错误响应统一为 `{ "msg": "可读的错误原因" }` 与对应 HTTP 状态码。

---

## 九、设计与安全

**设计 tokens**：主色 `#C8102E`、深红 `#8B0000`、金色 `#D4AF37`、页面背景 `#FAF8F5`、正文 `#2C2C2C`、次要文字 `#8C8C8C`；卡片 8px 圆角、按钮 6px 圆角、`0 2px 8px rgba(0,0,0,0.06)` 轻阴影、8px 栅格；红色只做强调，不大面积铺满。

**三档响应式**：≥1200px 三栏（200 / 680 / 280）；768–1199px 两栏（左导航收窄为 72px 图标）；<768px 单栏 + 底部 Tab。

**二级页面布局规范**（统一由 `theme.css` 控制，后续页面不得再单独收窄）：

- `--rl-page-secondary: 1080px`：图书详情、搜索、个人主页、上传、群聊等无右栏页面的内容宽度；
- `--rl-page-padding: 26px`：二级页面卡片统一内边距；
- 768–1199px 时二级页面占满可用宽度，不再被强制压缩到 680px；
- `.page-card` 统一 1px 边框 + 24/26px 内边距，避免卡片内容贴边；
- `.ant-modal-content` 统一 22/26px 内边距 + 1px 外框；仅「编辑资料」等自定义满幅弹窗单独取消默认 padding；
- E2E 在 1280px 和 900px 下断言二级页面主内容宽度与卡片内边距，并对举报弹窗、后台确认弹窗的内边距做回归断言。

**安全措施**：

- 邮箱验证码存于 Redis / 内存 TTL（5 分钟），60 秒限流，登录成功即失效；
- 每次登录尝试（含失败）写入 `login_logs`（邮箱、IP、UA、状态）；
- JWT 7 天有效期，写接口统一 401；
- ZIP 上传校验魔数、路径穿越（`../` / 绝对路径 / 符号链接）、可执行文件、条目数（2000）、解压体积（500MB）、压缩比（zip bomb），异常时清理临时 ZIP 与解压目录；
- 上传大小限制：图片 5MB、ZIP 100MB（后端 Multer + Nginx `client_max_body_size` 双重限制）；
- 帖子正文先 HTML 转义再渲染话题 / @，避免 XSS；
- 图书文件路径限制在 `uploads/` 内，禁止任意文件读取；
- 组织后台两级验证：组织系统密码（SQL `system_settings`）+ 组织管理员个人密码（scrypt + 随机盐）；SQL 开发者系统独立密码，管理员 JWT 2 小时，10 分钟内连续失败 10 次触发限流；
- 用户封锁状态在 JWT 守卫、登录、验证码发送和 Socket.IO 消息发送时回查，锁定后立即失去写权限；被封锁用户的文章 / 图书 / 主页 / 搜索 / 群聊历史从普通用户视图隐藏；
- 被封锁用户收到 403 时前端立即清理登录态并回到登录页；活跃页面每 30 秒、窗口重新聚焦时复查账号状态；
- 文章 / 图书下架状态由公开查询过滤，管理员后台仍可查看并恢复。

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

**v1.0.0** 是已创建的 GitHub Release；当前 `main` 分支已在其基础上加入：

- 注册 / 登录拆分、用户名 ID 与社区号；
- 组织 001 管理后台与 SQL 开发者管理系统；
- 举报处理、文章 / 图书下架、用户封锁；
- 二级页面宽度、卡片 / 弹窗内边距统一。

> 最新功能目前位于 `main`，尚未单独创建新的 Release tag。完整发布说明、环境依赖和本地运行全部功能的命令见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

- 验收结果：[TEST-REPORT.md](TEST-REPORT.md)
- 登录数据库使用：[DATABASE.md](DATABASE.md)

---

> 为了新世界，学习理论，团结同志。
