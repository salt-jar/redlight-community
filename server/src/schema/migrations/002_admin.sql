-- 旧版「门店管理后台」升级脚本（历史迁移）
-- 新环境请直接执行 003_organization_sql.sql；已有旧版数据库按 001 → 002 → 003 顺序升级。
-- 已有 MySQL 数据库升级：门店管理后台、举报、文章/用户状态
-- 执行顺序：先执行 001_user_identity.sql，再执行本文件。

ALTER TABLE users
    ADD COLUMN status TINYINT DEFAULT 1 COMMENT '1正常 0封禁' AFTER role;

ALTER TABLE posts
    ADD COLUMN status TINYINT DEFAULT 1 COMMENT '1正常 0已下架' AFTER comment_count,
    ADD INDEX idx_status_id (status, id);

CREATE TABLE IF NOT EXISTS stores (
    id            BIGINT       PRIMARY KEY COMMENT '门店编号，如 1001',
    name          VARCHAR(64)  NOT NULL COMMENT '门店名称',
    status        TINYINT      DEFAULT 1 COMMENT '1启用 0停用',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店';

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

INSERT IGNORE INTO stores (id, name) VALUES (1001, '一号门店'), (1002, '二号门店');
