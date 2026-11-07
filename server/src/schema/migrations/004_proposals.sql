-- 群聊提案与 @所有人 每周额度
-- 执行顺序：001 → 002 → 003 → 本文件（已有旧版数据库升级时）。

CREATE TABLE IF NOT EXISTS proposals (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    title         VARCHAR(120) NOT NULL,
    proposal_time VARCHAR(64)  NOT NULL,
    proposer_info VARCHAR(255) NOT NULL,
    content       TEXT         NOT NULL,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proposals_created (created_at DESC),
    INDEX idx_proposals_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提案';
