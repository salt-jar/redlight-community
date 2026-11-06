# 赤光社登录数据库使用指南

项目把每一次登录尝试（成功和失败）都写入 SQL 表 `login_logs`。本文说明数据库位置、表/视图字段、如何用命令行和图形工具查看，以及常用 SQL。

---

## 一、数据库在哪里

| 运行模式 | 数据库 | 说明 |
| --- | --- | --- |
| 本地开发（默认） | `赤光社/server/data/redlight.db` | SQLite，首次启动自动建表；无需安装数据库服务 |
| Docker / 线上 | MySQL 8.0 容器 `mysql` 的 `redlight` 库 | 由 `docker-compose.yml` 启动；首次启动自动导入 `server/src/schema/mysql.sql` |

SQLite 使用 WAL 模式，运行时会同时看到：

```text
server/data/redlight.db
server/data/redlight.db-wal
server/data/redlight.db-shm
```

这三个文件都属于数据库；**备份时不要只复制 `redlight.db`**，建议先停止服务再复制整个 `server/data/`，或使用 SQLite 的 `.backup` 命令。

> 数据库文件与 `.env` 已被 `.gitignore` 忽略，不会被提交到 Git。

---

## 二、登录数据表结构

### `login_logs`（每次登录尝试一行）

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | BIGINT / INTEGER | 自增主键 |
| `user_id` | BIGINT | 用户 ID；邮箱未注册或失败时为 `0` |
| `email` | VARCHAR(128) | 登录邮箱 |
| `login_ip` | VARCHAR(64) | 客户端 IP（本地通常为 `127.0.0.1` 或 `::1`） |
| `user_agent` | VARCHAR(512) | 浏览器 User-Agent（可看出浏览器 / 操作系统 / 设备） |
| `status` | TINYINT | `1` 成功，`0` 失败 |
| `created_at` | DATETIME | 登录时间（数据库存储为 UTC） |

### 可读视图 `login_log_details`

把 `login_logs` 与 `users` 关联，直接给出昵称、可读状态和本地时间：

| 字段 | 含义 |
| --- | --- |
| `nickname` | 用户昵称；未注册邮箱显示「未注册用户」 |
| `status_text` | 「成功」/「失败」 |
| `created_at_local` | 转换成本地时区的时间（SQLite） |

### 按天统计视图 `login_stats_daily`

| 字段 | 含义 |
| --- | --- |
| `login_date` | 日期（本地时区 / MySQL 数据库时区） |
| `total_count` | 当天登录尝试总数 |
| `success_count` | 成功次数 |
| `fail_count` | 失败次数 |
| `unique_emails` | 当天涉及的不同邮箱数 |

---

## 三、最快查看方式：项目自带命令

在**项目根目录**执行：

```powershell
cd "D:\Program\vibe codeing\@郑星成\赤光社"

# 最近 20 条登录记录
npm run logins

# 最近 50 条
npm run logins -- --limit 50

# 只看失败记录
npm run logins -- --status fail

# 按邮箱筛选
npm run logins -- --email reader@example.com

# 附带最近 14 天按天统计
npm run logins -- --stats

# 输出 JSON（便于脚本 / Excel 二次处理）
npm run logins -- --json
```

输出示例：

```text
数据库：D:\Program\vibe codeing\@郑星成\赤光社\server\data\redlight.db
总登录尝试：12 条（成功 8 / 失败 4，独立邮箱 5 个）
当前筛选：4 条，显示最近 4 条

┌────┬─────────────────────┬──────┬──────────────┬──────────────────┬───────────┬──────────────┐
│ ID │ 登录时间（本地）    │ 状态 │ 昵称         │ 邮箱             │ IP        │ User-Agent   │
...
```

如果数据库还没有记录，会提示先登录一次。登录地址：<http://127.0.0.1:5173>。

> 该命令通过 `server/node_modules/better-sqlite3` 以**只读**方式打开数据库，不会修改数据。  
> 使用 MySQL 时，请改用 MySQL 客户端查询（见第七节）。

---

## 四、用图形化工具查看

推荐 **DB Browser for SQLite**（免费）或用 VS Code 的 SQLite 插件：

1. 下载 / 安装 DB Browser for SQLite；
2. 打开文件：`赤光社/server/data/redlight.db`；
3. 点击「浏览数据（Browse Data）」；
4. 表下拉选择 `login_logs`（原始数据）或 `login_log_details`（带昵称 / 状态 / 本地时间）；
5. 点击「执行 SQL（Execute SQL）」可直接运行下面第五节的查询。

> 服务运行中也可以打开数据库查看；WAL 模式下建议刷新数据页。若要修改 / 删除数据，请先停止服务，避免写冲突。

---

## 五、常用 SQL 查询

在 DB Browser 的「执行 SQL」中运行，或用 `sqlite3` 命令行：

```sql
-- 最近 20 条登录记录（包含昵称、可读状态、本地时间）
SELECT * FROM login_log_details
ORDER BY id DESC
LIMIT 20;

-- 只看失败的登录尝试
SELECT * FROM login_log_details
WHERE status = 0
ORDER BY id DESC;

-- 某个邮箱的登录历史
SELECT * FROM login_log_details
WHERE email = 'reader@example.com'
ORDER BY id DESC;

-- 今天成功登录的用户
SELECT nickname, email, login_ip, created_at_local
FROM login_log_details
WHERE status = 1
  AND date(created_at_local) = date('now', 'localtime');

-- 按天统计成功 / 失败
SELECT * FROM login_stats_daily
ORDER BY login_date DESC;

-- 失败次数最多的 IP（排查异常尝试）
SELECT login_ip, COUNT(*) AS fail_count
FROM login_logs
WHERE status = 0
GROUP BY login_ip
ORDER BY fail_count DESC;

-- 最近登录的不同邮箱与最后登录时间
SELECT email, MAX(created_at_local) AS last_login
FROM login_log_details
GROUP BY email
ORDER BY last_login DESC;

-- 浏览器 / 操作系统粗略分布（User-Agent 前 60 字符）
SELECT substr(user_agent, 1, 60) AS ua, COUNT(*) AS count
FROM login_logs
GROUP BY ua
ORDER BY count DESC;
```

MySQL 版把 `date(created_at_local)` 改为 `DATE(created_at)`，`substr` 改为 `LEFT(user_agent, 60)` 即可。

---

## 六、如何产生登录数据

1. 确认服务已启动：在项目根目录运行 `npm run dev`；
2. 打开 <http://127.0.0.1:5173>；
3. 输入一个邮箱 → 点击「获取验证码」→ 登录页会显示开发模式验证码；
4. 输入**错误**验证码并登录 → 产生一条 `status=0` 失败记录；
5. 输入**正确**验证码登录 → 产生一条 `status=1` 成功记录；
6. 运行 `npm run logins` 查看。

> 开发模式下未配置 SMTP 时，验证码也会打印在运行 `npm run dev` 的终端里。

---

## 七、MySQL / Docker 下查看

Docker Compose 启动后：

```powershell
cd "D:\Program\vibe codeing\@郑星成\赤光社"

# 进入 MySQL 容器
docker compose exec mysql mysql -uroot -p redlight
# 输入 .env 里的 DB_PASSWORD

# 在 MySQL 提示符中：
SELECT * FROM login_log_details ORDER BY id DESC LIMIT 20;
SELECT * FROM login_stats_daily ORDER BY login_date DESC;
SELECT login_ip, COUNT(*) AS fail_count
FROM login_logs
WHERE status = 0
GROUP BY login_ip
ORDER BY fail_count DESC;
```

非容器环境先导入 schema（含视图）：

```bash
mysql -u root -p redlight < server/src/schema/mysql.sql
```

如果数据库已存在、只缺视图，可单独执行 `mysql.sql` 文件末尾的两个 `CREATE OR REPLACE VIEW` 语句。

---

## 八、备份、导出与重置

### 备份 SQLite

先停止服务，再复制整个目录：

```powershell
Copy-Item -Recurse "server\data" "server\data-backup-20261106"
```

或在服务停止后使用 SQLite 备份命令（需要 sqlite3 工具）：

```bash
sqlite3 server/data/redlight.db ".backup 'server/data/backup.db'"
```

### 导出为 CSV

DB Browser → 打开表 →「文件」→「导出」→「表为 CSV」。  
或用自带命令输出 JSON：`npm run logins -- --json > logins.json`。

### 清空登录数据（谨慎）

```sql
DELETE FROM login_logs;
```

重置整个开发数据库（会删除用户、帖子、图书等**所有**数据）：

1. 停止服务（Ctrl+C）；
2. 删除 `server/data/redlight.db`、`redlight.db-wal`、`redlight.db-shm`；
3. 重新运行 `npm run dev`，会自动重建表结构。

---

## 九、隐私与安全

- `login_logs` 包含邮箱、IP、User-Agent，属于个人信息，请勿公开分享数据库文件或截图；
- 该表只应由后端 / 管理员访问，不要新增公开 API 直接返回 `login_logs`；
- 生产环境建议定期备份、限制数据库端口访问，并配置 HTTPS；
- 本项目默认只在本地监听（`127.0.0.1`），不会把数据库直接暴露到公网。

---

## 十、常见问题

**Q：`npm run logins` 提示数据库不存在？**  
先运行 `npm run dev` 启动服务并登录一次；或检查 `.env` 的 `DB_FILE` 是否指向正确位置。

**Q：表里有记录，但昵称显示「未注册用户」？**  
说明该邮箱当时还没有注册（或登录失败时用户不存在），`user_id` 为 0，属于正常情况。

**Q：时间是 UTC 还是北京时间？**  
`created_at` 存 UTC；`created_at_local` 已经转成本地时间，直接看后者即可。

**Q：当前使用 MySQL，`npm run logins` 报错？**  
该命令只读 SQLite。MySQL 请使用 `docker compose exec mysql mysql ...` 或任意 MySQL 客户端查询 `login_log_details`。

**Q：可以按浏览器 / 设备统计吗？**  
可以。`user_agent` 是原始 UA 字符串，可按关键字粗略统计（`LIKE '%Chrome%'`、`LIKE '%Windows%'`）；若要精确解析，可在应用层引入 UA 解析库后新增字段。
