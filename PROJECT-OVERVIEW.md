# 赤光社 RedLight · 项目概述（供 AI 上下文使用）

> 项目根目录：`D:\Program\vibe codeing\@郑星成\赤光社`
> 当前形态：本地可完整运行、带自动化测试与 E2E 截图的全栈社区项目。
> GitHub：<https://github.com/salt-jar/redlight-community>
> 在线本地地址：<http://127.0.0.1:5173>；API：<http://127.0.0.1:3000>

## 一句话概述

赤光社 RedLight 是一个面向马列主义爱好者的全栈红色主题社区：包含邮箱验证码登录、自定义用户名 ID / 6 位社区号、首页「大字报」、文章发布与互动、PDF/EPUB 文献馆、全局搜索、四栏群聊、群切换、提案讨论 / 投票 / 群聊同步，以及组织 001 后台和 SQL 开发者管理系统。

## 技术栈

- 前端：Vue 3、Vite 7、TypeScript、Pinia、Vue Router 4、Ant Design Vue 4、Axios、Socket.IO Client；PDF.js、epub.js；Vitest + happy-dom + Vue Test Utils。
- 后端：Node.js 24、Express 4、Socket.IO、better-sqlite3 / mysql2、ioredis、Multer、adm-zip、Nodemailer、JWT、Node `crypto.scrypt`。
- 数据库：本机零依赖 SQLite（`server/data/redlight.db`）；生产可切 MySQL 8。表结构 15 张，含 `users`、`posts`、`comments`、`likes`、`books`、`chat_messages`、`login_logs`、`chat_groups`、`proposals`、`proposal_comments`、`proposal_votes`、`reports`、`organizations`、`organization_admins`、`system_settings`。
- E2E：Playwright Core 驱动本机 Microsoft Edge，使用独立临时 SQLite，不污染本地数据。

## 页面与布局

- 顶部红色导航栏；主色 `#C8102E`，深红 `#8B0000`，金色 `#D4AF37`，米白 `#FAF8F5`，正文 `#2C2C2C`。
- 首页、图书、我的：全宽布局，全局导航贴左，内容撑满；首页右侧栏固定 280px。
- 群聊：全宽四栏，无间隙，仅 1px 分隔线：
  1. 全局导航；
  2. 群列表（赤光总群、理论学习、文献研究、青年同志，可创建新群）；
  3. 聊天主区；
  4. 功能面板（由右上角「功能」按钮展开 / 收起，宽度为主聊天区的 1/3）。
- 提案详情：独立主页面，左上角「返回提案列表」；展示完整正文、发起人信息、投票、讨论；不混排提案列表。
- 二级内容页（图书详情 / 阅读器 / 搜索 / 上传等）保留 1080px 内容宽度与统一卡片内边距。

## 核心功能

### 用户与认证
- 邮箱验证码注册 / 登录分离；注册时自定义用户名 ID，自动生成 6 位社区号。
- 7 天 JWT；登录日志与每日统计视图。
- 用户被封禁后无法登录、发帖、评论、点赞、群聊；其文章 / 图书 / 主页 / 搜索 / 群聊历史对普通用户隐藏；前端收到 403 自动清理登录态。
- 首页「大字报」按时间倒序展示全部有效用户动态。

### 内容社区
- 发帖 / 转发 / 点赞 / 评论；单帖 1000 字、9 图限制。
- 图书 ZIP 上传、安全解压、PDF / EPUB 封面提取、在线阅读、下载计数。
- 全局搜索（图书 / 用户）、热榜与社区统计。

### 群聊（重点）
- 群列表切换，消息按 `chat_messages.group_id` 隔离；Socket.IO 群房间 `chat:join` / `chat:send`。
- 右侧「功能」面板默认收起，右上角按钮展开；面板内是提案列表和发起入口。
- 提案字段：标题、提案时间、发起人信息、正文。
- 提案讨论写入 `proposal_comments`，最多 2000 字，支持多人连续发言；同时同步为当前群聊的提案消息（`chat_messages.proposal_id`）。
- 群聊内提案消息有差异样式和「提案讨论」标识，右键可直接打开提案详情。
- 提案投票写入 `proposal_votes`，每人一票，可取消；列表和详情显示票数 / 讨论数。
- 已删除 `@所有人` 功能（按钮、API、服务端限流与新建表结构均不再使用）。

### 管理后台
- `/org/001`：组织第一级系统密码（SQL `system_settings`）+ 管理员个人 scrypt 密码。
- 通过第一级密码后可在登录页「注册管理员」：同时创建组织管理员与同邮箱社区用户，社区用户 `role=1`，群聊显示蓝色「管理员」标识。
- 组织后台：举报处理、文章下架 / 恢复、图书下架 / 恢复、用户封锁 / 解封、群聊创建。
- `/sql`：SQL 开发者密码 `1111`，拥有组织、组织管理员、系统设置和内容管理权限。
- 管理员社区账号可直接治理，无需进入 `/org/001`：
  - 用户主页「封禁此用户」；
  - 图书详情「管理员下架」；
  - 动态菜单「管理员下架文章」。
- 只有管理员可创建群聊；普通用户调用创建接口返回 401。
- 不存在的“门店 / store”概念：只有组织 `001` 和 SQL 开发者系统。
- SQL 开发者密码与原有 SQL 操作保持不变。

## 目录结构

```text
赤光社/
├── client/                 # Vue 3 前端
│   └── src/
│       ├── views/          # Home / Chat / Books / Profile / AdminPortal ...
│       ├── components/     # AppShell、聊天、帖子、弹窗等
│       ├── api/            # chat / proposals / admin / moderation ...
│       ├── stores/         # auth / ui
│       └── styles/theme.css
├── server/                 # Express + Socket.IO 后端
│   ├── src/
│   │   ├── routes/         # auth/posts/chat/proposals/admin/moderation...
│   │   ├── services/       # mailer、storage、adminAccounts...
│   │   ├── schema/         # sqlite.sql、mysql.sql、migrations
│   │   └── socket.js
│   ├── scripts/            # create-org-admin、create-demo-accounts
│   └── tests/              # 10 个 Vitest 集成测试文件
├── e2e/                    # Playwright E2E + 27 张截图
├── README.md
├── TEST-REPORT.md
├── DATABASE.md
└── PROJECT-OVERVIEW.md
```

## 运行方式

```powershell
cd "D:\Program\vibe codeing\@郑星成\赤光社"
npm install
npm run dev
```

- 前端：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:3000>
- 本地 SQLite 零依赖；邮件使用 console 模式，验证码会显示在登录页 / 后端控制台。
- 常用命令：

```powershell
npm run test:server
npm run test:client
npm run e2e
cd server; npm run demo:accounts
cd server; npm run admin:create -- --org 001 --username admin001 --password "至少8位" --name "管理员" --email "admin@example.com"
```

## 本地演示账号

- 组织后台：<http://127.0.0.1:5173/org/001>
  - 第一级系统密码：当前本地数据库值 `2222`（可在 SQL `system_settings` 修改；初始默认 `SQL`）
  - 管理员账号：`demo_admin`
  - 管理员密码：`Admin@12345`
  - 关联社区邮箱：`demo_admin@redlight.local`（邮箱验证码登录，群聊蓝色管理员标识）
- 普通用户：
  - `xinghuo@redlight.local` / 同志_星火 / `@xinghuo`
  - `shuguang@redlight.local` / 同志_曙光 / `@shuguang`
  - `qingnian@redlight.local` / 同志_青年 / `@qingnian`
- SQL 开发者：<http://127.0.0.1:5173/sql>，密码 `1111`。
- 演示账号仅用于本地，公开部署前请修改或删除。

## 测试与当前状态

- 后端：**10 个测试文件 / 75 个用例通过**（含群聊分组、管理员关联账号、群聊创建权限、直接治理、提案讨论 / 投票 / Socket 实时同步）。
- 前端：**6 个测试文件 / 21 个用例通过**。
- E2E：**27 张截图通过**，0 页面异常、0 控制台错误。
- `vue-tsc --noEmit`、`vite build` 通过。
- E2E 证据：`e2e/screenshots/01-login.png` 至 `27-proposal-right-click.png`；运行结果 JSON 日志已清理并加入 `.gitignore`。
- 当前 Git 远端：`salt-jar/redlight-community`，最近提交以 `git log -1` 为准。

## 重要约束（给 AI 的规则）

1. 使用中文回复。
2. 技术栈、红色主题、现有 UI 风格保持一致。
3. 不要引入“门店 / store”语义；管理结构只有组织 `001` 和 `/sql`。
4. SQL 开发者密码 `1111` 与原有 SQL 操作不要随意修改。
5. 群聊主布局保持全宽、贴边、四栏无间隙；功能面板由「功能」按钮展开，宽度为主聊天区 1/3。
6. 提案详情必须是独立页面视图，不混排提案列表；返回按钮回列表。
7. 提案讨论必须与普通群聊回复区分；讨论同步到当前群聊；群聊提案消息右键打开详情。
8. 不要恢复已删除的 `@所有人` 功能。
9. 修改后必须同步 README / TEST-REPORT / DATABASE 中受影响内容，并跑测试与构建。

## AI 概述词（可直接粘贴到新对话）

```text
你是赤光社 RedLight 项目的开发助手。项目路径：
D:\Program\vibe codeing\@郑星成\赤光社

这是一个中文马列主义爱好者社区，前端 Vue 3 + Vite + TypeScript + Pinia + Ant Design Vue，后端 Node.js + Express + Socket.IO + SQLite/MySQL，测试用 Vitest，E2E 用 Playwright。

核心页面：红色主题全宽布局；首页「大字报」；全宽图书页；全宽个人主页；群聊四栏布局（全局导航 / 群列表 / 聊天主区 / 功能面板）。右上角「功能」按钮展开右侧提案面板，面板宽度为聊天主区 1/3；点击提案条目进入独立提案详情页，左上角返回列表；提案支持投票、多人连续讨论，讨论消息同步到当前群聊，群聊内提案消息右键打开详情。已删除 @所有人。

后台：/org/001 组织两级密码，/sql 密码 1111；管理员注册时同步创建社区用户并在群聊显示蓝色「管理员」标识；管理员可在组织页面创建群聊，普通用户不能；管理员社区账号可直接封人、下架图书、下架文章，无需进入 001。不要使用“门店/store”概念，SQL 操作保持不变。

本地演示账号：demo_admin / Admin@12345；组织一级密码当前 2222；普通用户 xinghuo@redlight.local、shuguang@redlight.local、qingnian@redlight.local，邮箱验证码登录；SQL 密码 1111。

当前测试：后端 75 用例、前端 21 用例、E2E 27 张截图，类型检查与构建均通过。回答使用中文；保持现有设计 token 和 UI 风格；修改后同步 README、TEST-REPORT、DATABASE 并运行测试。
```

## 关键词

赤光社, RedLight, 马列主义社区, Vue3, Express, Socket.IO, SQLite, MySQL, 大字报, 群聊, 四栏布局, 功能面板, 提案, 提案讨论, 投票, 群聊同步, 右键提案, 组织001, SQL开发者系统, 管理员蓝色标识, 邮箱验证码, 社区号, PDF/EPUB, Vitest, Playwright.
