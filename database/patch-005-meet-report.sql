USE wefinally;

CREATE TABLE IF NOT EXISTS `meet_report` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `match_user_id` int DEFAULT 0 COMMENT '见面对象(可空)',
  `meet_time` datetime NULL,
  `meet_place` varchar(200) DEFAULT '' COMMENT '用户填写地点',
  `lat` decimal(10,6) DEFAULT NULL,
  `lng` decimal(10,6) DEFAULT NULL,
  `meet_note` varchar(500) DEFAULT '',
  `emergency_contact` varchar(30) DEFAULT '' COMMENT '紧急联系人手机号',
  `safety_ack` tinyint DEFAULT 0 COMMENT '已读安全提示',
  `status` tinyint DEFAULT 0 COMMENT '0进行中1已结束2已取消',
  `card_no` varchar(40) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线下见面报备';

CREATE TABLE IF NOT EXISTS `sos_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `meet_report_id` int DEFAULT 0,
  `lat` decimal(10,6) DEFAULT NULL,
  `lng` decimal(10,6) DEFAULT NULL,
  `emergency_contact` varchar(30) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一键呼救记录(证据链)';
