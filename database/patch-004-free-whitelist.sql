USE wefinally;

-- 单位脱敏白名单（平台只接收，不自采）
CREATE TABLE IF NOT EXISTS `free_whitelist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL,
  `name` varchar(50) DEFAULT '',
  `unit` varchar(100) DEFAULT '' COMMENT '提交单位',
  `source` varchar(20) NOT NULL COMMENT 'public公职/edu教师/med医护',
  `used` tinyint DEFAULT 0 COMMENT '0未领取1已领取',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公职/教师/医护免费白名单';

-- user 免费会员标记
ALTER TABLE `user` ADD COLUMN `free_member` tinyint NOT NULL DEFAULT 0 COMMENT '1=公益免费会员(永久豁免188)';
ALTER TABLE `user` ADD COLUMN `free_source` varchar(20) NOT NULL DEFAULT '' COMMENT 'public/edu/med';
