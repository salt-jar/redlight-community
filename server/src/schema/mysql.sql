-- 赤光社 RedLight · MySQL 8.0 建表脚本
-- 说明：MySQL 8.0 部署目标；中文全文检索使用 ngram 分词器。
-- 用法：mysql -u root -p redlight < server/src/schema/mysql.sql

SET NAMES utf8mb4;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    email         VARCHAR(128) NOT NULL UNIQUE COMMENT '邮箱账号',
    nickname      VARCHAR(64)  NOT NULL COMMENT '昵称',
    username      VARCHAR(32)  NOT NULL UNIQUE COMMENT '用户自定义ID，用于加好友',
    community_no  CHAR(6)      NOT NULL UNIQUE COMMENT '系统随机6位社区号',
    avatar_url    VARCHAR(512) DEFAULT '' COMMENT '头像',
    bio           VARCHAR(255) DEFAULT '' COMMENT '个人简介',
    role          TINYINT      DEFAULT 0 COMMENT '0普通用户 1管理员',
    status        TINYINT      DEFAULT 1 COMMENT '1正常 0封禁',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 登录日志表（核心需求：SQL 记录登录数据）
CREATE TABLE IF NOT EXISTS login_logs (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL COMMENT '登录失败且用户不存在时为 0',
    email         VARCHAR(128) NOT NULL,
    login_ip      VARCHAR(64)  DEFAULT '' COMMENT '登录IP',
    user_agent    VARCHAR(512) DEFAULT '' COMMENT '浏览器UA',
    status        TINYINT      DEFAULT 1 COMMENT '1成功 0失败',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志';

-- 文章表（类微博信息流）
CREATE TABLE IF NOT EXISTS posts (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    content       TEXT         NOT NULL COMMENT '正文内容',
    images        JSON         COMMENT '配图URL数组',
    repost_id     BIGINT       NULL COMMENT '转发引用的原帖ID',
    like_count    INT          DEFAULT 0,
    comment_count INT          DEFAULT 0,
    status        TINYINT      DEFAULT 1 COMMENT '1正常 0已下架',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at DESC),
    INDEX idx_status_id (status, id),
    INDEX idx_repost_id (repost_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章/帖子';

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
    post_id    BIGINT      NOT NULL,
    user_id    BIGINT      NOT NULL,
    content    VARCHAR(500) NOT NULL,
    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论';

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
    id         BIGINT   PRIMARY KEY AUTO_INCREMENT,
    user_id    BIGINT   NOT NULL,
    post_id    BIGINT   NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_post (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点赞';

-- 图书表
CREATE TABLE IF NOT EXISTS books (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    uploader_id   BIGINT       NOT NULL,
    title         VARCHAR(255) NOT NULL COMMENT '书名',
    author        VARCHAR(128) DEFAULT '' COMMENT '作者',
    category      VARCHAR(64)  DEFAULT '' COMMENT '分类：马恩著作/列宁著作/哲学/政治经济学...',
    description   TEXT         COMMENT '简介',
    cover_url     VARCHAR(512) DEFAULT '' COMMENT '封面',
    file_path     VARCHAR(512) NOT NULL COMMENT '解压后文件路径',
    file_format   VARCHAR(16)  DEFAULT 'pdf' COMMENT 'pdf/epub',
    file_size     BIGINT       DEFAULT 0 COMMENT '文件大小(字节)',
    download_count INT         DEFAULT 0,
    status        TINYINT      DEFAULT 1 COMMENT '1已上架 0审核中',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_created_at (created_at DESC),
    FULLTEXT INDEX ft_book_search (title, author, description) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图书';

-- 群聊消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
    user_id    BIGINT      NOT NULL,
    type       TINYINT     DEFAULT 1 COMMENT '1文字 2图片',
    content    TEXT        COMMENT '文字内容或图片URL',
    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群聊消息';

-- 门店（管理后台租户）
CREATE TABLE IF NOT EXISTS stores (
    id            BIGINT       PRIMARY KEY COMMENT '门店编号，如 1001',
    name          VARCHAR(64)  NOT NULL COMMENT '门店名称',
    status        TINYINT      DEFAULT 1 COMMENT '1启用 0停用',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店';

-- 门店管理员（二级个人密码）
CREATE TABLE IF NOT EXISTS store_admins (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    store_id      BIGINT       NOT NULL,
    username      VARCHAR(32)  NOT NULL COMMENT '管理员登录账号',
    password_hash VARCHAR(128) NOT NULL COMMENT 'scrypt 哈希',
    password_salt VARCHAR(64)  NOT NULL,
    display_name  VARCHAR(64)  DEFAULT '' COMMENT '显示名称',
    role          TINYINT      DEFAULT 1,
    status        TINYINT      DEFAULT 1 COMMENT '1启用 0停用',
    last_login_at DATETIME     NULL,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_store_admin (store_id, username),
    INDEX idx_store_admins_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店管理员';

-- 举报（全站队列）
CREATE TABLE IF NOT EXISTS reports (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    reporter_id   BIGINT       NOT NULL,
    target_type   VARCHAR(16)  NOT NULL COMMENT 'post / book',
    target_id     BIGINT       NOT NULL,
    reason        VARCHAR(64)  NOT NULL,
    detail        VARCHAR(500) DEFAULT '',
    status        TINYINT      DEFAULT 0 COMMENT '0待处理 1已处理 2已忽略',
    action        VARCHAR(32)  DEFAULT '',
    handled_by    BIGINT       NULL,
    handled_at    DATETIME     NULL,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reports_status (status, created_at DESC),
    INDEX idx_reports_target (target_type, target_id),
    INDEX idx_reports_reporter (reporter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='举报';

-- 登录明细视图：关联用户昵称，输出可读状态与本地时间（数据库时区即本地时区）
CREATE OR REPLACE VIEW login_log_details AS
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
    l.created_at AS created_at_local
FROM login_logs l
LEFT JOIN users u ON u.id = l.user_id;

-- 每日登录统计视图：成功 / 失败 / 独立邮箱数
CREATE OR REPLACE VIEW login_stats_daily AS
SELECT
    DATE(l.created_at) AS login_date,
    COUNT(*) AS total_count,
    SUM(CASE WHEN l.status = 1 THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN l.status = 0 THEN 1 ELSE 0 END) AS fail_count,
    COUNT(DISTINCT l.email) AS unique_emails
FROM login_logs l
GROUP BY DATE(l.created_at);
