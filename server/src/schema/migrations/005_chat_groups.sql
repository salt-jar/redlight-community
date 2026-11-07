-- 群聊分组与消息所属群
-- 执行顺序：001 → 002 → 003 → 004 → 本文件（已有旧版数据库升级时）。

CREATE TABLE IF NOT EXISTS chat_groups (
    id            BIGINT       PRIMARY KEY COMMENT '群编号',
    name          VARCHAR(64)  NOT NULL COMMENT '群名称',
    description   VARCHAR(255) DEFAULT '' COMMENT '群说明',
    sort_order    INT          DEFAULT 0,
    status        TINYINT      DEFAULT 1 COMMENT '1启用 0停用',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群聊分组';

ALTER TABLE chat_messages
    ADD COLUMN group_id BIGINT NOT NULL DEFAULT 1 COMMENT '所属群' AFTER id,
    ADD INDEX idx_chat_group (group_id, id);

INSERT IGNORE INTO chat_groups (id, name, description, sort_order) VALUES
    (1, '赤光总群', '全站同志交流与公告', 1),
    (2, '理论学习', '经典著作与理论学习讨论', 2),
    (3, '文献研究', '文献整理、版本与阅读心得', 3),
    (4, '青年同志', '青年学习与实践活动', 4);
