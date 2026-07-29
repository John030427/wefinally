USE wefinally;

ALTER TABLE `user` ADD COLUMN `appearance_description` TEXT DEFAULT NULL COMMENT '外貌描述(本人填)';
ALTER TABLE `user` ADD COLUMN `appearance_want` TEXT DEFAULT NULL COMMENT '期待对方外貌(本人填)';
ALTER TABLE `user` ADD COLUMN `appearance_tags` VARCHAR(500) DEFAULT NULL COMMENT 'LLM抽:本人外貌标签JSON数组';
ALTER TABLE `user` ADD COLUMN `appearance_want_tags` VARCHAR(500) DEFAULT NULL COMMENT 'LLM抽:期待外貌标签JSON数组';
