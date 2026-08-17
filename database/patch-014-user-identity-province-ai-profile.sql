-- patch-014: multi-identity tags + province/city + AI match profile versioning
-- Additive / backward-compatible. Do NOT run against production without explicit approval.
-- Keeps user.circle_id and user.city as legacy primary fields.

ALTER TABLE `user`
  ADD COLUMN IF NOT EXISTS `province_code` varchar(12) NOT NULL DEFAULT '' COMMENT '省份行政区划代码' AFTER `city`,
  ADD COLUMN IF NOT EXISTS `province_name` varchar(32) NOT NULL DEFAULT '' COMMENT '省份名称' AFTER `province_code`,
  ADD COLUMN IF NOT EXISTS `city_code` varchar(12) NOT NULL DEFAULT '' COMMENT '城市行政区划代码' AFTER `province_name`,
  ADD COLUMN IF NOT EXISTS `city_name` varchar(32) NOT NULL DEFAULT '' COMMENT '城市名称（规范化）' AFTER `city_code`,
  ADD COLUMN IF NOT EXISTS `country_code` varchar(8) NOT NULL DEFAULT 'CN' COMMENT '国家代码预留' AFTER `city_name`,
  ADD COLUMN IF NOT EXISTS `country_name` varchar(32) NOT NULL DEFAULT '中国' COMMENT '国家名称预留' AFTER `country_code`;

-- MySQL versions without IF NOT EXISTS on ADD COLUMN: apply manually / via migration runner.

CREATE TABLE IF NOT EXISTS `user_identity_tag` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `circle_id` int NOT NULL COMMENT 'occupation_circle.id；0 表示其他',
  `is_primary` tinyint NOT NULL DEFAULT 0 COMMENT '1=主要身份',
  `source` varchar(32) NOT NULL DEFAULT 'user_declared' COMMENT 'user_declared|legacy_backfill|admin',
  `verified_status` varchar(32) NOT NULL DEFAULT 'unverified' COMMENT 'unverified|pending|verified|rejected',
  `occupation_description` varchar(100) NOT NULL DEFAULT '' COMMENT 'circle_id=0 时的说明',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_circle` (`user_id`, `circle_id`),
  KEY `idx_user_primary` (`user_id`, `is_primary`),
  CONSTRAINT `fk_user_identity_tag_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户多重身份标签；推广归属仍只看 user.promote_partner_id';

ALTER TABLE `user_match_setting`
  ADD COLUMN IF NOT EXISTS `ai_match_profile_json` json NULL COMMENT '版本化 AI Match Profile（派生数据）',
  ADD COLUMN IF NOT EXISTS `ai_match_profile_version` int NOT NULL DEFAULT 0 COMMENT 'AI画像版本号',
  ADD COLUMN IF NOT EXISTS `ai_match_profile_source_version` varchar(64) NOT NULL DEFAULT '' COMMENT '触发生成的源资料指纹',
  ADD COLUMN IF NOT EXISTS `ai_match_profile_status` varchar(32) NOT NULL DEFAULT 'missing' COMMENT 'missing|ready|stale|failed',
  ADD COLUMN IF NOT EXISTS `ai_match_profile_generated_at` datetime NULL,
  ADD COLUMN IF NOT EXISTS `ai_match_profile_confirmed_at` datetime NULL,
  ADD COLUMN IF NOT EXISTS `profile_version` int NOT NULL DEFAULT 1 COMMENT '用户可感知资料版本';

CREATE TABLE IF NOT EXISTS `coordination_notification` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `coordination_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `event_type` varchar(64) NOT NULL,
  `coordination_version` int NOT NULL DEFAULT 1,
  `expected_coordination_version` int NOT NULL DEFAULT 1,
  `channel` varchar(32) NOT NULL DEFAULT 'in_app' COMMENT 'in_app|wechat_subscribe',
  `status` varchar(32) NOT NULL DEFAULT 'queued' COMMENT 'queued|sent|skipped|stale|failed|merged',
  `title` varchar(120) NOT NULL DEFAULT '',
  `body` varchar(500) NOT NULL DEFAULT '',
  `payload_json` json NULL,
  `merge_key` varchar(120) NOT NULL DEFAULT '',
  `read_at` datetime NULL,
  `sent_at` datetime NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_unread` (`user_id`, `read_at`, `create_time`),
  KEY `idx_coord_version` (`coordination_id`, `coordination_version`),
  KEY `idx_merge` (`user_id`, `merge_key`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='协调站内/订阅通知；发送前校验 expected_coordination_version';

CREATE TABLE IF NOT EXISTS `user_notification_cursor` (
  `user_id` bigint NOT NULL,
  `last_seen_coordination_event_id` bigint NOT NULL DEFAULT 0,
  `last_seen_coordination_version` int NOT NULL DEFAULT 0,
  `unread_count` int NOT NULL DEFAULT 0,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户站内未读游标';

-- Backfill guidance (application-layer / one-off job, not auto-destructive):
-- 1) INSERT primary identity from user.circle_id for rows missing user_identity_tag
-- 2) Lazy-normalize user.city into province_*/city_* via regionNormalize.js
-- 3) Partner attribution MUST continue using promote_partner_id only
