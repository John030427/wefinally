USE wefinally;

ALTER TABLE `marry_report`
  ADD COLUMN `openid` varchar(100) DEFAULT '' COMMENT '注册前离异复入申请 openid' AFTER `user_id`,
  ADD COLUMN `contact_phone` varchar(30) DEFAULT '' COMMENT '离异复入联系电话' AFTER `proof_img`,
  ADD COLUMN `review_note` varchar(500) DEFAULT '' COMMENT '离异复入申请说明/客服备注' AFTER `contact_phone`,
  ADD COLUMN `reject_reason` varchar(255) DEFAULT '' COMMENT '审核驳回原因' AFTER `review_note`,
  ADD COLUMN `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `create_time`,
  ADD KEY `idx_openid_type` (`openid`, `report_type`),
  ADD KEY `idx_report_type_status` (`report_type`, `audit_status`);
