-- 将旧版赤光社 MySQL 数据库升级到「自定义用户名 ID + 社区号」结构
-- 仅需对 v1.0.0 及更早创建的数据库执行一次；全新数据库直接使用 ../mysql.sql 即可。
--
-- 用法：
--   mysql -u root -p redlight < server/src/schema/migrations/001_user_identity.sql

ALTER TABLE users
    ADD COLUMN username VARCHAR(32) NULL AFTER nickname,
    ADD COLUMN community_no CHAR(6) NULL AFTER username;

-- 旧用户：使用 user_<id> 作为初始用户名 ID（用户后续无法自行修改 ID）
UPDATE users
SET username = CONCAT('user_', id)
WHERE username IS NULL OR username = '';

-- 为旧用户补唯一 6 位社区号
DELIMITER $$
CREATE PROCEDURE backfill_community_no()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE uid BIGINT;
    DECLARE candidate CHAR(6);
    DECLARE cur CURSOR FOR SELECT id FROM users WHERE community_no IS NULL OR community_no = '';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO uid;
        IF done THEN
            LEAVE read_loop;
        END IF;
        SET candidate = LPAD(FLOOR(RAND() * 900000) + 100000, 6, '0');
        WHILE EXISTS (SELECT 1 FROM users WHERE community_no = candidate) DO
            SET candidate = LPAD(FLOOR(RAND() * 900000) + 100000, 6, '0');
        END WHILE;
        UPDATE users SET community_no = candidate WHERE id = uid;
    END LOOP;
    CLOSE cur;
END$$
DELIMITER ;

CALL backfill_community_no();
DROP PROCEDURE backfill_community_no;

ALTER TABLE users
    MODIFY username VARCHAR(32) NOT NULL,
    MODIFY community_no CHAR(6) NOT NULL,
    ADD UNIQUE KEY uk_users_username (username),
    ADD UNIQUE KEY uk_users_community_no (community_no);
