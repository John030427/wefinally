-- 官方奔现对接工单：用户间无私聊，仅平台客服处理
CREATE TABLE IF NOT EXISTS `match_handoff_ticket` (
  `id` int NOT NULL AUTO_INCREMENT,
  `match_log_id` int NOT NULL COMMENT '发起方看到的匹配记录ID',
  `user_id` int NOT NULL COMMENT '申请对接用户ID',
  `match_user_id` int NOT NULL COMMENT '匹配对象用户ID',
  `status` varchar(30) NOT NULL DEFAULT 'submitted' COMMENT 'submitted/processing/waiting_partner/arranged/closed',
  `service_note` varchar(500) DEFAULT '' COMMENT '客服备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_match_log` (`user_id`, `match_log_id`),
  KEY `idx_status_time` (`status`, `update_time`),
  KEY `idx_match_user` (`match_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='官方奔现对接工单';
