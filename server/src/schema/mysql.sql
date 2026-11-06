-- 赤光社 RedLight · MySQL 8.0 建表脚本
-- 说明：MySQL 8.0 部署目标；中文全文检索使用 ngram 分词器。
-- 用法：mysql -u root -p redlight < server/src/schema/mysql.sql

SET NAMES utf8mb4;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    email         VARCHAR(128) NOT NULL UNIQUE COMMENT '邮箱账号',
    nickname      VARCHAR(64)  NOT NULL COMMENT '昵称',
    avatar_url    VARCHAR(512) DEFAULT '' COMMENT '头像',
    bio           VARCHAR(255) DEFAULT '' COMMENT '个人简介',
    role          TINYINT      DEFAULT 0 COMMENT '0普通用户 1管理员',
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
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at DESC),
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
