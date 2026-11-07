-- 提案讨论、投票与群聊同步
-- 执行顺序：001 → 002 → 003 → 004 → 005 → 006 → 本文件。

ALTER TABLE chat_messages
    ADD COLUMN proposal_id BIGINT NULL COMMENT '同步自提案讨论的提案ID' AFTER content,
    ADD INDEX idx_chat_proposal (proposal_id);

CREATE TABLE IF NOT EXISTS proposal_comments (
    id              BIGINT      PRIMARY KEY AUTO_INCREMENT,
    proposal_id     BIGINT      NOT NULL,
    user_id         BIGINT      NOT NULL,
    group_id        BIGINT      NOT NULL,
    content         TEXT        NOT NULL,
    chat_message_id BIGINT      NULL,
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proposal_comments (proposal_id, id),
    INDEX idx_proposal_comments_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提案讨论发言';

CREATE TABLE IF NOT EXISTS proposal_votes (
    id          BIGINT      PRIMARY KEY AUTO_INCREMENT,
    proposal_id BIGINT      NOT NULL,
    user_id     BIGINT      NOT NULL,
    created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_proposal_vote (proposal_id, user_id),
    INDEX idx_proposal_votes (proposal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提案投票';
