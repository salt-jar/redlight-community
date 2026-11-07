# 赤光社 RedLight · 验收报告

> 执行日期：2026-11-06  
> 项目目录：`D:\Program\vibe codeing\@郑星成\赤光社`  
> 依据：`spec.md`、`tasks.md`、`checklist.md`、`马列主义爱好者社区-技术方案.md`

## 一、结论

项目已按方案完成，全部自动化测试通过：

| 测试层 | 命令 | 结果 |
| --- | --- | --- |
| 后端集成测试 | `npm run test:server` | **9 个测试文件 / 65 个用例全部通过** |
| 前端单元测试 | `npm run test:client` | **6 个测试文件 / 21 个用例全部通过** |
| 端到端测试 | `npm run e2e` | **全流程通过**，19 张截图，0 页面异常，0 控制台错误 |
| 前端类型检查 | `vue-tsc --noEmit` | 通过 |
| 生产构建 | `vite build` | 通过（3465+ 模块） |
| 一键开发启动 | `npm run dev` | 通过（后端 3000 健康检查、前端 5173 均正常） |
| Docker Compose 静态校验 | PyYAML 解析 + `deployment.test.js` | 通过（本机无 Docker，按方案做静态校验） |

> 环境限制说明：本机无 Docker / MySQL / Redis / SMTP。因此 MySQL 与 Redis 分支通过 schema 静态一致性、SQL 分支代码与环境切换测试验证；本地全流程以 `DB_DRIVER=sqlite` + 内存缓存 + console 邮件模式完成，符合 `spec.md` 的「环境适配」约定。
>
> 登录数据增强：新增 `login_log_details` / `login_stats_daily` 视图与 `npm run logins` 命令行查看工具，覆盖视图创建、读取与每日统计测试；使用说明见 [DATABASE.md](DATABASE.md)。

## 二、测试结果明细

### 1. 后端（65 个用例）

| 测试文件 | 用例数 | 覆盖点 |
| --- | --- | --- |
| `health-schema.test.js` | 6 | 健康检查、API 404、默认 100MB 限制、MySQL/SQLite 字段一致性、`posts.repost_id`、ngram 仅 MySQL、登录明细 / 按天统计视图 |
| `auth.test.js` | 13 | 注册 / 登录分离、6 位验证码 / 5 分钟 / 60 秒 429、自定义用户名 ID 与 6 位社区号、重复邮箱 / ID、失败日志、7 天 JWT、验证码一次性、401 |
| `admin.test.js` | 7 | 组织 001 入口、SQL 系统密码 + 个人密码、SQL 开发者 1111 高权限、组织 / 系统设置、举报文章 / 图书、下架、封锁用户、文章 / 图书 / 用户管理、举报参数校验 |
| `posts.test.js` | 8 | 倒序分页、1000 字 / 9 图校验、点赞幂等、评论计数、转发引用、点赞态、404 |
| `books.test.js` | 10 | 合法 PDF / EPUB 上架、封面提取、临时文件清理、分类分页、文件流、下载计数、路径穿越 / 可执行文件 / 无书 / 非 ZIP / 缺书名 / 超限 413、未授权 |
| `search.test.js` | 5 | 中文图书（SQLite LIKE）、作者 / 简介、昵称 / 邮箱、各 5 条、分页、分类、排除未上架 |
| `chat.test.js` | 5 | 无效 token 拒绝、多标签去重、双人在线、文字广播落库、图片消息 / 非法地址 / 空消息、最近 50 条与 beforeId 分页 |
| `users-stats.test.js` | 7 | 用户主页分页、热榜排序与 60s 缓存、发帖后缓存失效、社区真实统计、在线空列表、修改昵称 / 头像及参数校验 |
| `deployment.test.js` | 4 | Compose 服务 / 数据卷、Nginx 100M + `/api` `/uploads` `/socket.io` 代理 + SPA 回退、Dockerfile、`.env.example` 与 README 要点 |

### 2. 前端（21 个用例）

| 测试文件 | 用例数 | 覆盖点 |
| --- | --- | --- |
| `format.spec.ts` | 4 | 万格式化、千分位、相对时间、日期 / 文件大小 |
| `richText.spec.ts` | 3 | XSS 转义、话题 / @ 高亮、话题提取 |
| `debounce.spec.ts` | 2 | 300ms 防抖、cancel |
| `auth.spec.ts` | 3 | token / 用户持久化、退出清理、fetchMe |
| `PostCard.spec.ts` | 6 | 作者 / 富文本、点赞乐观更新、万显示、评论展开、转发引用、跳转主页 |
| `GlobalSearch.spec.ts` | 3 | 300ms 防抖分组结果、回车跳转、空关键词不请求 |

### 3. E2E（Playwright + 本机 Edge 156）

执行链路：

```text
未登录守卫 → 注册新账号（自定义用户名 ID / 6 位社区号）→ 三栏 200/680/280 与配色断言
→ 发帖（#话题# + @）→ 点赞 → 评论 → 转发
→ ZIP 上传 PDF → PDF 渲染 / 2 页翻页 / 120% 缩放 / 下载
→ ZIP 上传 EPUB → epub.js 渲染并切到第二章
→ 图书库分类筛选 → 全局搜索（图书 / 用户 Tab）
→ 群聊（双用户实时消息、在线人数 2）→ 个人主页
→ 编辑昵称 / 上传头像 → 保存并校验顶栏、主页与动态作者同步
→ 900px 两栏 → 375px 单栏 + 底部 Tab / 横向溢出检查
→ 900px 二级页面宽度与 1280px 卡片内边距断言
→ 移动端搜索入口 → 移动端结果页
→ 提交文章举报 → 组织 001 后台（SQL 系统密码 + 个人密码）→ 查看举报 → 下架文章
→ SQL 开发者系统（密码 1111）→ 组织管理 / 系统设置
→ 图书详情举报弹窗内边距 / 边框回归检查
```

证据截图位于 `e2e/screenshots/`：

| 截图 | 内容 |
| --- | --- |
| `01-login.png` | 登录页（登录 / 注册分离，天安门 / 红旗 / 齿轮 / 麦穗线稿） |
| `02-home-feed.png` | 首页三栏、热榜 / 在线 / 社区数据、帖子与转发引用 |
| `03-book-detail.png` | 图书详情（自动提取封面） |
| `04-reader-pdf.png` | PDF.js 第 2/2 页、120% 缩放 |
| `05-reader-epub.png` | epub.js 第二章 |
| `06-books-library.png` | 赤光文献馆分类筛选 |
| `07-search-results.png` | 搜索结果页用户 Tab |
| `08-chat.png` / `09-chat-two-users.png` | 群聊、双用户在线 |
| `10-profile.png` | 个人主页、用户名 ID / 社区号与动态 |
| `11-profile-edit.png` | 编辑昵称 / 上传头像弹窗 |
| `12-profile-updated.png` | 保存后顶栏、主页与动态作者同步 |
| `13-responsive-900.png` | 900px 两栏 |
| `14-responsive-375.png` | 375px 单栏 + 底部 Tab |
| `15-mobile-search.png` | 375px 移动端搜索入口与结果页 |
| `16-admin-dashboard.png` | 组织 001 后台：两级验证后查看举报队列与统计 |
| `17-admin-report-handled.png` | 组织后台下架被举报文章、举报队列清空 |
| `18-sql-admin.png` | SQL 开发者管理系统（1111）：组织管理 / 系统设置高权限页面 |
| `19-report-dialog.png` | 举报弹窗：统一 22/26px 内边距与 1px 外框 |
| `e2e-result.json` | 本次 E2E 结果（邮箱、昵称、19 张截图、错误列表为空） |

## 三、checklist.md 逐项核对

| # | 检查项 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | SQLite 无依赖启动，`/api/health` 正常 | ✅ | `health-schema.test.js`；`npm run dev` 实测 `{"ok":true,"driver":"sqlite"}` |
| 2 | 双 schema 字段一致、`repost_id`、索引 / ngram 仅 MySQL | ✅ | `health-schema.test.js` PRAGMA 对比 + 正则断言 |
| 3 | 6 位码、5 分钟、60 秒 429 | ✅ | `auth.test.js` 「发送 6 位验证码…」 |
| 4 | 错误验证码 400 + `login_logs` `status=0` | ✅ | `auth.test.js`（含 IP / UA） |
| 5 | 7 天 JWT + 成功日志 | ✅ | `auth.test.js` 解码 `exp-iat=604800` |
| 6 | 原「未注册邮箱首次登录自动建号」→ 已按新需求改为登录 / 注册分离 | ✅（需求变更） | `auth.test.js` 未注册登录返回 400；`/api/auth/register` 创建账号 |
| 6.1 | 注册时自定义用户名 ID，限制内容且禁止网页特殊符号 | ✅ | 前后端 4–20 位中文 / 字母 / 数字 / 下划线校验；E2E 注册流程 |
| 6.2 | 注册自动生成唯一 6 位社区号，可用于查询 | ✅ | `auth.test.js` 社区号唯一性 + 按社区号搜索；E2E 注册返回 6 位社区号 |
| 7 | 未登录跳转 / 写接口 401 | ✅ | E2E Guard；`auth.test.js` |
| 8 | 三档响应式 | ✅ | E2E 断言 200/680/280、900→72、375→底部 Tab |
| 9 | 配色 / 圆角 / 阴影 | ✅ | E2E 计算样式校验 `rgb(200,16,46)`、`rgb(250,248,245)`、8px |
| 10 | 9 图 / 1000 字限制、发布滑入提示 | ✅ | `posts.test.js`；E2E 发布 + 顶部动态；`TransitionGroup` |
| 11 | 信息流分页 / 骨架屏 / 滚动加载 / 到底 / 空状态 | ✅ | `posts.test.js` 分页；E2E 到底提示；组件 `PostSkeleton` / `EmptyState` |
| 12 | 点赞幂等 / 计数 / 万显示 | ✅ | `posts.test.js`；`format.spec.ts`；`PostCard.spec.ts`；E2E |
| 13 | 评论卡片内展开、即时追加、计数 | ✅ | `posts.test.js`；E2E；`CommentList.vue` |
| 14 | 转发 `repost_id` + 引用块 | ✅ | `posts.test.js`；E2E `.repost-quote` |
| 15 | ZIP 100MB、路径穿越 / 可执行拒绝与清理 | ✅ | `books.test.js` 4 类恶意包 + 413；`nginx.conf` 100M |
| 16 | 无 PDF/EPUB 拒绝；合法上架；临时 ZIP 删除 | ✅ | `books.test.js` |
| 17 | 封面提取；失败用占位 | ✅ | `books.test.js` PDF `cover.png` / EPUB `cover.jpg`；`default-cover.svg` |
| 18 | 图书库分类筛选 / 分页 / 详情 | ✅ | `books.test.js`；E2E 分类切换 |
| 19 | PDF 翻页缩放；EPUB 阅读 | ✅ | E2E 2/2 页 + 120%；EPUB 第二章 |
| 20 | 下载附件 + `download_count` +1 | ✅ | `books.test.js` 连续下载 1→2；E2E 下载文件名 |
| 21 | 顶栏搜索 300ms 防抖 / 分组 / 回车 | ✅ | `GlobalSearch.spec.ts`；E2E |
| 22 | 中文图书搜索 / 昵称 / 用户名 ID / 社区号用户搜索 | ✅ | `search.test.js`；E2E |
| 23 | 搜索结果 Tab / 分页 | ✅ | E2E 全部 / 图书 / 用户；`search.test.js` 分页 |
| 24 | Socket.IO 握手校验 JWT | ✅ | `chat.test.js` 无效 / 空 token 拒绝 |
| 25 | 文字 / 图片消息落库广播、最近 50 / 上翻 | ✅ | `chat.test.js`；E2E 双用户实时消息 |
| 26 | 在线人数 / 列表实时 | ✅ | `chat.test.js`；E2E 在线 2 人；右侧栏 `chat:online` |
| 27 | 用户主页与分页 | ✅ | `users-stats.test.js`；E2E 个人主页 |
| 27.1 | 用户可修改自己的昵称与头像 | ✅ | `users-stats.test.js` 修改资料 / 参数校验；E2E 编辑弹窗、头像上传与同步 |
| 28 | 右侧栏热榜 / 在线 / 社区真实数据 | ✅ | `users-stats.test.js`；E2E 截图；发帖后缓存失效 |
| 29 | Compose / Dockerfile / Nginx / `.env.example` | ✅ | `deployment.test.js`；PyYAML 解析（4 服务 / 3 数据卷） |
| 30 | README 覆盖启动 / Docker / SMTP / ngram / 版权 | ✅ | `deployment.test.js` + README 人工检查 |
| 31 | 本地全流程联调 | ✅ | E2E 全链路通过 |
| 32 | `/org/001` 组织后台与 `/sql` 开发者系统入口 | ✅ | Vue Router `/org/:orgCode`、`/sql`；`admin.test.js` 组织公开信息；E2E 两个入口 |
| 33 | 组织系统密码（SQL 设置）+ 管理员个人密码 | ✅ | `admin.test.js` 错误系统密码 403、错误个人密码 401、组织设置更新；E2E 两级表单 |
| 34 | SQL 开发者系统 1111 与更高权限 | ✅ | `admin.test.js` SQL 登录、组织列表 / 系统设置；E2E SQL 后台系统设置 |
| 35 | 用户举报文章 / 图书并进入后台 | ✅ | `admin.test.js` 举报落库、重复举报 409、后台列表含目标内容；E2E 举报队列 |
| 36 | 后台下架 / 恢复文章与图书、封锁用户 | ✅ | `admin.test.js` 下架公开页面 404、恢复、封锁后登录/写接口 403；E2E 下架文章 |
| 37 | 二级页面内容宽度 / 卡片内边距统一 | ✅ | `theme.css` `--rl-page-secondary: 1080px`、`--rl-page-padding: 26px`；E2E 1280px 主内容 ≥1000px、900px ≥760px、卡片内边距 ≥24px、无横向溢出 |
| 38 | 弹窗边框 / 内容内边距统一 | ✅ | `.ant-modal-content` 统一 22/26px 内边距 + 1px 外框；编辑资料弹窗单独保留自定义满幅头部；E2E 举报弹窗与后台确认弹窗内边距断言 |

## 四、环境适配与已知限制

1. **MySQL**：本机无 MySQL 服务，未执行真实 MySQL 集成测试；已通过：
   - `mysql.sql` 与 `sqlite.sql` 字段逐项一致性测试；
   - `FULLTEXT ... WITH PARSER ngram`、索引、`repost_id` 静态断言；
   - 数据访问层按 `db.driver` 切换 SQL 分支；
   - Docker Compose 首次启动自动挂载 schema。
2. **Redis**：本机无 Redis，验证码 / 限流使用内存 TTL；`createCache` 在 `REDIS_URL` 存在时连接 Redis，连接失败自动回退内存并告警。
3. **SMTP**：本机未配置 SMTP，使用 console 模式；开发环境返回 `devCode`，E2E 已验证；配置真实 SMTP 的代码路径与生产 503 保护已实现。
4. **Docker**：本机未安装 Docker，`docker compose up` 未实际执行；已完成 compose / Dockerfile / nginx 静态校验与 YAML 解析。
5. **浏览器**：E2E 使用本机 Microsoft Edge 156（`playwright-core` 不下载额外浏览器）。

## 五、复现方式

```powershell
cd 赤光社
npm run install:all

# 后端 65 用例
npm run test:server

# 前端 21 用例
npm run test:client

# 端到端（自动启动 3101 / 5188 临时服务）
npm run e2e

# 类型检查 + 生产构建
npm run build

# 本地一键启动
npm run dev
```
