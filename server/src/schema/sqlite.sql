-- 赤光社 RedLight · SQLite 本地开发建表脚本
-- 说明：仅用于本地免依赖联调（DB_DRIVER=sqlite），字段与 MySQL 版保持一致；
-- SQLite 不支持 FULLTEXT ngram，中文搜索自动回退为 LIKE。

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    nickname      TEXT    NOT NULL,
    username      TEXT    NOT NULL COLLATE NOCASE UNIQUE,
    community_no  TEXT    NOT NULL UNIQUE,
    avatar_url    TEXT    DEFAULT '',
    bio           TEXT    DEFAULT '',
    role          INTEGER DEFAULT 0,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nickname ON users(nickname);

CREATE TABLE IF NOT EXISTS login_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    email         TEXT    NOT NULL,
    login_ip      TEXT    DEFAULT '',
    user_agent    TEXT    DEFAULT '',
    status        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at);

CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    content       TEXT    NOT NULL,
    images        TEXT,
    repost_id     INTEGER NULL,
    like_count    INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_repost_id ON posts(repost_id);

CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    content    TEXT    NOT NULL,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

CREATE TABLE IF NOT EXISTS likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    post_id    INTEGER NOT NULL,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS books (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    uploader_id    INTEGER NOT NULL,
    title          TEXT    NOT NULL,
    author         TEXT    DEFAULT '',
    category       TEXT    DEFAULT '',
    description    TEXT,
    cover_url      TEXT    DEFAULT '',
    file_path      TEXT    NOT NULL,
    file_format    TEXT    DEFAULT 'pdf',
    file_size      INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    status         INTEGER DEFAULT 1,
    created_at     TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    type       INTEGER DEFAULT 1,
    content    TEXT,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- 登录明细视图：关联用户昵称，输出可读状态与本地时间
CREATE VIEW IF NOT EXISTS login_log_details AS
SELECT
    l.id,
    l.user_id,
    COALESCE(u.nickname, '未注册用户') AS nickname,
    l.email,
    l.login_ip,
    l.user_agent,
    CASE l.status WHEN 1 THEN '成功' ELSE '失败' END AS status_text,
    l.status,
    l.created_at,
    datetime(l.created_at, 'localtime') AS created_at_local
FROM login_logs l
LEFT JOIN users u ON u.id = l.user_id;

-- 每日登录统计视图：成功 / 失败 / 独立邮箱数
CREATE VIEW IF NOT EXISTS login_stats_daily AS
SELECT
    date(l.created_at, 'localtime') AS login_date,
    COUNT(*) AS total_count,
    SUM(CASE WHEN l.status = 1 THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN l.status = 0 THEN 1 ELSE 0 END) AS fail_count,
    COUNT(DISTINCT l.email) AS unique_emails
FROM login_logs l
GROUP BY date(l.created_at, 'localtime');

