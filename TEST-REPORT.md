# 赤光社 RedLight · 验收报告

> 执行日期：2026-11-06  
> 项目目录：`D:\Program\vibe codeing\@郑星成\赤光社`  
> 依据：`spec.md`、`tasks.md`、`checklist.md`、`马列主义爱好者社区-技术方案.md`

## 一、结论

项目已按方案完成，全部自动化测试通过：

| 测试层 | 命令 | 结果 |
| --- | --- | --- |
| 后端集成测试 | `npm run test:server` | **8 个测试文件 / 52 个用例全部通过** |
| 前端单元测试 | `npm run test:client` | **6 个测试文件 / 21 个用例全部通过** |
| 端到端测试 | `npm run e2e` | **全流程通过**，13 张截图，0 页面异常，0 控制台错误 |
| 前端类型检查 | `vue-tsc --noEmit` | 通过 |
| 生产构建 | `vite build` | 通过（3465+ 模块） |
| 一键开发启动 | `npm run dev` | 通过（后端 3000 健康检查、前端 5173 均正常） |
| Docker Compose 静态校验 | PyYAML 解析 + `deployment.test.js` | 通过（本机无 Docker，按方案做静态校验） |

> 环境限制说明：本机无 Docker / MySQL / Redis / SMTP。因此 MySQL 与 Redis 分支通过 schema 静态一致性、SQL 分支代码与环境切换测试验证；本地全流程以 `DB_DRIVER=sqlite` + 内存缓存 + console 邮件模式完成，符合 `spec.md` 的「环境适配」约定。
>
> 登录数据增强：新增 `login_log_details` / `login_stats_daily` 视图与 `npm run logins` 命令行查看工具，覆盖视图创建、读取与每日统计测试；使用说明见 [DATABASE.md](DATABASE.md)。

## 二、测试结果明细

### 1. 后端（52 个用例）

| 测试文件 | 用例数 | 覆盖点 |
| --- | --- | --- |
| `health-schema.test.js` | 6 | 健康检查、API 404、默认 100MB 限制、MySQL/SQLite 字段一致性、`posts.repost_id`、ngram 仅 MySQL、登录明细 / 按天统计视图 |
| `auth.test.js` | 9 | 6 位验证码 / 5 分钟 / 60 秒 429、失败日志、过期日志、自动注册昵称、7 天 JWT、验证码一次性、401 |
| `posts.test.js` | 8 | 倒序分页、1000 字 / 9 图校验、点赞幂等、评论计数、转发引用、点赞态、404 |
| `books.test.js` | 10 | 合法 PDF / EPUB 上架、封面提取、临时文件清理、分类分页、文件流、下载计数、路径穿越 / 可执行文件 / 无书 / 非 ZIP / 缺书名 / 超限 413、未授权 |
| `search.test.js` | 5 | 中文图书（SQLite LIKE）、作者 / 简介、昵称 / 邮箱、各 5 条、分页、分类、排除未上架 |
| `chat.test.js` | 5 | 无效 token 拒绝、多标签去重、双人在线、文字广播落库、图片消息 / 非法地址 / 空消息、最近 50 条与 beforeId 分页 |
| `users-stats.test.js` | 5 | 用户主页分页、热榜排序与 60s 缓存、发帖后缓存失效、社区真实统计、在线空列表 |
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
未登录守卫 → 验证码登录（自动注册）→ 三栏 200/680/280 与配色断言
→ 发帖（#话题# + @）→ 点赞 → 评论 → 转发
→ ZIP 上传 PDF → PDF 渲染 / 2 页翻页 / 120% 缩放 / 下载
→ ZIP 上传 EPUB → epub.js 渲染并切到第二章
→ 图书库分类筛选 → 全局搜索（图书 / 用户 Tab）
→ 群聊（双用户实时消息、在线人数 2）→ 个人主页
→ 900px 两栏 → 375px 单栏 + 底部 Tab / 横向溢出检查
→ 移动端搜索入口 → 移动端结果页
```

证据截图位于 `e2e/screenshots/`：

| 截图 | 内容 |
| --- | --- |
| `01-login.png` | 登录页（天安门 / 红旗 / 齿轮 / 麦穗线稿、验证码登录） |
| `02-home-feed.png` | 首页三栏、热榜 / 在线 / 社区数据、帖子与转发引用 |
| `03-book-detail.png` | 图书详情（自动提取封面） |
| `04-reader-pdf.png` | PDF.js 第 2/2 页、120% 缩放 |
| `05-reader-epub.png` | epub.js 第二章 |
| `06-books-library.png` | 赤光文献馆分类筛选 |
| `07-search-results.png` | 搜索结果页用户 Tab |
| `08-chat.png` / `09-chat-two-users.png` | 群聊、双用户在线 |
| `10-profile.png` | 个人主页与动态 |
| `11-responsive-900.png` | 900px 两栏 |
| `12-responsive-375.png` | 375px 单栏 + 底部 Tab |
| `13-mobile-search.png` | 375px 移动端搜索入口与结果页 |
| `e2e-result.json` | 本次 E2E 结果（邮箱、昵称、截图列表、错误列表为空） |

## 三、checklist.md 逐项核对

| # | 检查项 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | SQLite 无依赖启动，`/api/health` 正常 | ✅ | `health-schema.test.js`；`npm run dev` 实测 `{"ok":true,"driver":"sqlite"}` |
| 2 | 双 schema 字段一致、`repost_id`、索引 / ngram 仅 MySQL | ✅ | `health-schema.test.js` PRAGMA 对比 + 正则断言 |
| 3 | 6 位码、5 分钟、60 秒 429 | ✅ | `auth.test.js` 「发送 6 位验证码…」 |
| 4 | 错误验证码 400 + `login_logs` `status=0` | ✅ | `auth.test.js`（含 IP / UA） |
| 5 | 7 天 JWT + 成功日志 | ✅ | `auth.test.js` 解码 `exp-iat=604800` |
| 6 | 自动注册 `同志_<前缀>` | ✅ | `auth.test.js` / E2E 昵称 `同志_e2e179` |
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
| 22 | 中文图书搜索 / 昵称用户搜索 | ✅ | `search.test.js`；E2E |
| 23 | 搜索结果 Tab / 分页 | ✅ | E2E 全部 / 图书 / 用户；`search.test.js` 分页 |
| 24 | Socket.IO 握手校验 JWT | ✅ | `chat.test.js` 无效 / 空 token 拒绝 |
| 25 | 文字 / 图片消息落库广播、最近 50 / 上翻 | ✅ | `chat.test.js`；E2E 双用户实时消息 |
| 26 | 在线人数 / 列表实时 | ✅ | `chat.test.js`；E2E 在线 2 人；右侧栏 `chat:online` |
| 27 | 用户主页与分页 | ✅ | `users-stats.test.js`；E2E 个人主页 |
| 28 | 右侧栏热榜 / 在线 / 社区真实数据 | ✅ | `users-stats.test.js`；E2E 截图；发帖后缓存失效 |
| 29 | Compose / Dockerfile / Nginx / `.env.example` | ✅ | `deployment.test.js`；PyYAML 解析（4 服务 / 3 数据卷） |
| 30 | README 覆盖启动 / Docker / SMTP / ngram / 版权 | ✅ | `deployment.test.js` + README 人工检查 |
| 31 | 本地全流程联调 | ✅ | E2E 全链路通过 |

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

# 后端 52 用例
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
