USE wefinally;

CREATE TABLE IF NOT EXISTS `meet_location_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `meet_report_id` int DEFAULT 0,
  `lat` decimal(10,6) DEFAULT NULL,
  `lng` decimal(10,6) DEFAULT NULL,
  `accuracy` decimal(8,2) DEFAULT NULL,
  `source` varchar(20) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `meet_report_id` (`meet_report_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='见面安全实时位置轨迹';

CREATE TABLE IF NOT EXISTS `free_whitelist_import_batch` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int DEFAULT 0,
  `source` varchar(20) DEFAULT '',
  `unit` varchar(100) DEFAULT '',
  `received_count` int DEFAULT 0,
  `imported_count` int DEFAULT 0,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='免费白名单导入批次';
