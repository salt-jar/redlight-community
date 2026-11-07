-- 从「门店」升级为「组织 001 + SQL 开发者系统」
-- 执行顺序：001_user_identity.sql → 002_admin.sql → 本文件。
-- 本迁移会把原 1001 门店管理员迁移为组织 001 管理员，并删除旧门店表。
-- 原 1002 门店管理员不再保留；SQL 开发者系统使用 SQL_ADMIN_PASSWORD（默认 1111）。

CREATE TABLE IF NOT EXISTS organizations (
    code          VARCHAR(16)  PRIMARY KEY COMMENT '组织编号，如 001',
    name          VARCHAR(64)  NOT NULL COMMENT '组织名称',
    status        TINYINT      DEFAULT 1 COMMENT '1启用 0停用',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织';

CREATE TABLE IF NOT EXISTS organization_admins (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    org_code      VARCHAR(16)  NOT NULL,
    username      VARCHAR(32)  NOT NULL COMMENT '管理员登录账号',
    password_hash VARCHAR(128) NOT NULL COMMENT 'scrypt 哈希',
    password_salt VARCHAR(64)  NOT NULL,
    display_name  VARCHAR(64)  DEFAULT '' COMMENT '显示名称',
    status        TINYINT      DEFAULT 1 COMMENT '1启用 0停用',
    last_login_at DATETIME     NULL,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_org_admin (org_code, username),
    INDEX idx_org_admins_org (org_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织管理员';

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   VARCHAR(64)  PRIMARY KEY,
    value         VARCHAR(255) NOT NULL,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统设置';

INSERT IGNORE INTO organizations (code, name) VALUES ('001', '赤光社组织');
INSERT IGNORE INTO system_settings (setting_key, value) VALUES ('org.001.gate_password', 'SQL');

-- 将旧 1001 门店管理员迁移到组织 001
INSERT INTO organization_admins (org_code, username, password_hash, password_salt, display_name, status, last_login_at, created_at)
SELECT '001', username, password_hash, password_salt, display_name, status, last_login_at, created_at
FROM store_admins
WHERE store_id = 1001
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    password_salt = VALUES(password_salt),
    display_name = VALUES(display_name),
    status = VALUES(status);

DROP TABLE IF EXISTS store_admins;
DROP TABLE IF EXISTS stores;
