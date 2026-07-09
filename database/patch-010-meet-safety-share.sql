USE wefinally;

SET @has_safety_prompt := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meet_report'
    AND COLUMN_NAME = 'safety_prompt'
);
SET @sql := IF(
  @has_safety_prompt = 0,
  'ALTER TABLE meet_report ADD COLUMN safety_prompt varchar(500) DEFAULT '''' COMMENT ''用户提交时确认的安全提示原文'' AFTER safety_ack',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @has_share_token := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meet_report'
    AND COLUMN_NAME = 'share_token'
);
SET @sql := IF(
  @has_share_token = 0,
  'ALTER TABLE meet_report ADD COLUMN share_token varchar(64) DEFAULT '''' COMMENT ''亲友只读分享令牌'' AFTER card_no',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
