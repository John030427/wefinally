-- 补丁 002：合伙人用户审核留痕表
USE wefinally;

CREATE TABLE IF NOT EXISTS `partner_user_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partner_id` int NOT NULL,
  `user_id` int NOT NULL,
  `action` varchar(20) NOT NULL COMMENT 'approve/reject',
  `reason` varchar(255) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `partner_id` (`partner_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人用户审核留痕';
