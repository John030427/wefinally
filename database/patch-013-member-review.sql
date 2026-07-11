USE wefinally;

ALTER TABLE `user`
  ADD COLUMN IF NOT EXISTS `occupation_description` varchar(100) DEFAULT '' COMMENT '职业圈层选择其他时填写' AFTER `circle_id`,
  ADD COLUMN IF NOT EXISTS `member_status` varchar(30) NOT NULL DEFAULT 'legacy_unmigrated' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `member_status_updated_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `member_status`;

UPDATE `user`
SET member_status = CASE
  WHEN status = 1 THEN 'approved'
  WHEN status = 2 THEN 'disabled'
  WHEN status = 3 THEN 'disabled'
  ELSE 'pending_profile'
END
WHERE member_status IS NULL OR member_status = '' OR member_status = 'legacy_unmigrated';

ALTER TABLE `user`
  MODIFY COLUMN `member_status` varchar(30) NOT NULL DEFAULT 'pending_profile';

CREATE TABLE IF NOT EXISTS `member_application` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `inviter_partner_id` int NOT NULL,
  `assigned_partner_id` int NOT NULL,
  `revision` int NOT NULL DEFAULT 1,
  `status` varchar(30) NOT NULL DEFAULT 'pending_review',
  `profile_snapshot_json` json NULL,
  `review_note` varchar(500) DEFAULT '',
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by_role` varchar(20) DEFAULT '',
  `reviewed_by_id` int DEFAULT 0,
  `reviewed_at` datetime NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_revision` (`user_id`, `revision`),
  KEY `idx_assignee_status` (`assigned_partner_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='正式会员申请';

ALTER TABLE `partner_user_audit_log`
  ADD COLUMN IF NOT EXISTS `application_id` int DEFAULT 0 AFTER `user_id`,
  ADD COLUMN IF NOT EXISTS `actor_role` varchar(20) NOT NULL DEFAULT 'partner' AFTER `application_id`,
  ADD COLUMN IF NOT EXISTS `actor_id` int NOT NULL DEFAULT 0 AFTER `actor_role`,
  ADD COLUMN IF NOT EXISTS `from_status` varchar(30) DEFAULT '' AFTER `action`,
  ADD COLUMN IF NOT EXISTS `to_status` varchar(30) DEFAULT '' AFTER `from_status`,
  MODIFY COLUMN `action` varchar(30) NOT NULL,
  MODIFY COLUMN `reason` varchar(500) DEFAULT '';
