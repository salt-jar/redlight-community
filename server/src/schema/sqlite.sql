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
    status        INTEGER DEFAULT 1,
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
    status        INTEGER DEFAULT 1,
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

-- 群聊分组
CREATE TABLE IF NOT EXISTS chat_groups (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    description   TEXT    DEFAULT '',
    sort_order    INTEGER DEFAULT 0,
    status        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL DEFAULT 1,
    user_id    INTEGER NOT NULL,
    type       INTEGER DEFAULT 1,
    content    TEXT,
    proposal_id INTEGER NULL,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- 提案（群聊右侧功能栏）
CREATE TABLE IF NOT EXISTS proposals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    title         TEXT    NOT NULL,
    proposal_time TEXT    NOT NULL,
    proposer_info TEXT    NOT NULL,
    content       TEXT    NOT NULL,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id);

-- 提案讨论发言（同时同步到群聊）
CREATE TABLE IF NOT EXISTS proposal_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id     INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    group_id        INTEGER NOT NULL,
    content         TEXT    NOT NULL,
    chat_message_id INTEGER NULL,
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proposal_comments ON proposal_comments(proposal_id, id);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_group ON proposal_comments(group_id);

-- 提案投票
CREATE TABLE IF NOT EXISTS proposal_votes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (proposal_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_proposal_votes ON proposal_votes(proposal_id);

-- 组织（如 001）
CREATE TABLE IF NOT EXISTS organizations (
    code          TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    status        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 组织管理员（个人二级密码）
CREATE TABLE IF NOT EXISTS organization_admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    org_code      TEXT    NOT NULL,
    username      TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    password_salt TEXT    NOT NULL,
    display_name  TEXT    DEFAULT '',
    user_id       INTEGER NULL,
    status        INTEGER DEFAULT 1,
    last_login_at TEXT    NULL,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_code, username)
);
CREATE INDEX IF NOT EXISTS idx_org_admins_org ON organization_admins(org_code);

-- 系统设置（组织一级密码等，可通过 SQL 修改）
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   TEXT    PRIMARY KEY,
    value         TEXT    NOT NULL,
    updated_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 举报（全站队列）
CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id   INTEGER NOT NULL,
    target_type   TEXT    NOT NULL,
    target_id     INTEGER NOT NULL,
    reason        TEXT    NOT NULL,
    detail        TEXT    DEFAULT '',
    status        INTEGER DEFAULT 0,
    action        TEXT    DEFAULT '',
    handled_by    INTEGER NULL,
    handled_at    TEXT    NULL,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

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

