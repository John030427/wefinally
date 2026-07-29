USE wefinally;

ALTER TABLE `user_match_setting`
  ADD COLUMN `psych_profile_json` TEXT DEFAULT NULL COMMENT '轻量心理/关系偏好JSON' AFTER `target_view_text`;

ALTER TABLE `user_match_log`
  ADD COLUMN `total_score` DECIMAL(6,2) DEFAULT 0.00 COMMENT '综合匹配分' AFTER `view_similarity`,
  ADD COLUMN `score_detail_json` TEXT DEFAULT NULL COMMENT '算法分数拆解JSON' AFTER `total_score`,
  ADD COLUMN `score_version` VARCHAR(30) DEFAULT 'algo_psych_v1' COMMENT '评分版本' AFTER `score_detail_json`,
  ADD COLUMN `ai_report_text` TEXT DEFAULT NULL COMMENT '面向当前用户的AI匹配报告' AFTER `score_version`,
  ADD COLUMN `ai_report_status` TINYINT DEFAULT 0 COMMENT '0未生成1成功2失败3关闭' AFTER `ai_report_text`,
  ADD COLUMN `ai_report_error` VARCHAR(255) DEFAULT '' COMMENT 'AI报告错误摘要' AFTER `ai_report_status`,
  ADD COLUMN `ai_report_time` DATETIME NULL COMMENT 'AI报告生成时间' AFTER `ai_report_error`;
