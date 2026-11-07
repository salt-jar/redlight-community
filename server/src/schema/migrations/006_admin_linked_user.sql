-- 组织管理员关联社区用户（管理员同时拥有普通用户身份，群聊展示蓝色管理员标识）
-- 执行顺序：001 → 002 → 003 → 004 → 005 → 本文件。

ALTER TABLE organization_admins
    ADD COLUMN user_id BIGINT NULL COMMENT '关联社区用户' AFTER display_name,
    ADD INDEX idx_org_admins_user (user_id);
