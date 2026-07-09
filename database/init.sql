-- We Finally 完整版上线数据库 含合伙人推广溯源体系 + 三观匹配文本字段
-- 导入: mysql -u root -p < database/init.sql

CREATE DATABASE IF NOT EXISTS wefinally DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wefinally;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1.职业圈层表
CREATE TABLE IF NOT EXISTS `occupation_circle` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '圈层ID',
  `circle_name` varchar(100) NOT NULL COMMENT '圈层名称',
  `plate_name` varchar(50) NOT NULL COMMENT '所属板块',
  `partner_id` int DEFAULT 0 COMMENT '绑定合伙人ID，0=未认领',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '1正常 0禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='50职业圈层表';

-- 50圈层初始化数据
INSERT INTO `occupation_circle` (`id`, `circle_name`, `plate_name`, `status`) VALUES
(1,'综合公务员','体制稳定圈层',1),
(2,'中小学/幼教教师','体制稳定圈层',1),
(3,'医院医护（医生+护士）','体制稳定圈层',1),
(4,'国企基层正式职工（能源/交通/水务）','体制稳定圈层',1),
(5,'军警/退伍体系','体制稳定圈层',1),
(6,'国有银行基层金融从业者','体制稳定圈层',1),
(7,'互联网研发/产品/运营','互联网白领商务圈层',1),
(8,'新媒体、直播短视频从业者','互联网白领商务圈层',1),
(9,'品牌市场、公关策划','互联网白领商务圈层',1),
(10,'财务、审计、财税师','互联网白领商务圈层',1),
(11,'企业法务','互联网白领商务圈层',1),
(12,'猎头、人力资源HR','互联网白领商务圈层',1),
(13,'程序员、软件工程师','技术高薪工科圈层',1),
(14,'建筑土木、造价工程师','技术高薪工科圈层',1),
(15,'电气/自动化机械工程师','技术高薪工科圈层',1),
(16,'新能源、光伏锂电技术岗','技术高薪工科圈层',1),
(17,'生物医药检验研发','技术高薪工科圈层',1),
(18,'航空机务、轨道交通技术岗','技术高薪工科圈层',1),
(19,'餐饮茶饮实体店主','实体创业商家圈层',1),
(20,'美业（美发美甲医美咨询师）','实体创业商家圈层',1),
(21,'婚庆婚礼摄影策划','实体创业商家圈层',1),
(22,'教培机构创始人','实体创业商家圈层',1),
(23,'汽修二手车商户','实体创业商家圈层',1),
(24,'生鲜、服装实体批发商','实体创业商家圈层',1),
(25,'艺术乐器舞蹈美术老师','文艺兴趣女性圈层',1),
(26,'健身、瑜伽私教','文艺兴趣女性圈层',1),
(27,'花艺、茶艺、香道从业者','文艺兴趣女性圈层',1),
(28,'户外露营徒步领队','文艺兴趣女性圈层',1),
(29,'剧本杀桌游线下店主','文艺兴趣女性圈层',1),
(30,'独立写真、婚礼跟拍摄影师','文艺兴趣女性圈层',1),
(31,'情感/心理咨询师','自由职业小众优质圈层',1),
(32,'保险、独立理财经纪人','自由职业小众优质圈层',1),
(33,'宠物门店、专业训犬师','自由职业小众优质圈层',1),
(34,'文旅导游、定制旅行师','自由职业小众优质圈层',1),
(35,'插画、自由撰稿人','自由职业小众优质圈层',1),
(36,'模特、礼仪演艺从业者','自由职业小众优质圈层',1),
(37,'硕博高知圈层（硕士/博士/高校科研/博士后）','高端精英增补圈层',1),
(38,'海归留学圈层（留学生、归国人才、海外校友会）','高端精英增补圈层',1),
(39,'投行/券商/基金/私募金融精英','高端精英增补圈层',1),
(40,'地产甲方、开发企业高管','高端精英增补圈层',1),
(41,'民航机长、空乘、民航管理岗','高端精英增补圈层',1),
(42,'商事高端投融资律师','高端精英增补圈层',1),
(43,'医美机构创始人、皮肤科医师','高端精英增补圈层',1),
(44,'连锁品牌创始人、连锁加盟商','高端精英增补圈层',1),
(45,'公考/职业考证培训讲师','高端精英增补圈层',1),
(46,'同城本地生活探店自媒体博主','高端精英增补圈层',1),
(47,'专业运动俱乐部主理人（篮球/羽毛球/马术等）','特色机动储备圈层',1),
(48,'海外华人、跨境外贸老板圈层','特色机动储备圈层',1),
(49,'民营企业、家族企业二代圈层','特色机动储备圈层',1),
(50,'央企总部中高层管理岗','特色机动储备圈层',1);

-- 2.用户主表（含推广溯源）
CREATE TABLE IF NOT EXISTS `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openid` varchar(100) NOT NULL COMMENT '微信唯一标识',
  `gender` tinyint NOT NULL COMMENT '1男2女',
  `birth_year` int NOT NULL,
  `height_range` varchar(30) NOT NULL,
  `education` varchar(20) NOT NULL,
  `circle_id` int NOT NULL COMMENT '所属职业圈层',
  `city` varchar(20) DEFAULT '深圳',
  `marry_status` varchar(20) NOT NULL COMMENT '未婚/离异',
  `baby_plan` varchar(30) NOT NULL COMMENT '婚育节奏',
  `income_range` varchar(30) DEFAULT '',
  `house_car` varchar(30) DEFAULT '',
  `status` tinyint NOT NULL DEFAULT 0 COMMENT '0待审核 1正常 2封号 3已结婚注销',
  `is_vip` tinyint NOT NULL DEFAULT 0,
  `vip_expire_time` datetime NULL,
  `last_match_setting_time` datetime NULL COMMENT '最后一次修改择偶条件时间',
  `promote_partner_id` int DEFAULT 0 COMMENT '推广归属合伙人ID，永久锁定',
  `promote_code` varchar(50) DEFAULT '' COMMENT '用户注册来源推广码',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `openid` (`openid`),
  KEY `promote_partner_id` (`promote_partner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表（含合伙人推广溯源）';

-- 3.用户择偶设置表（新增三观文本字段 +7天冷却核心）
CREATE TABLE IF NOT EXISTS `user_match_setting` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `age_min` int,
  `age_max` int,
  `height_min` int,
  `height_max` int,
  `min_education` varchar(20),
  `like_circle_ids` varchar(200) DEFAULT '' COMMENT '偏好圈层',
  `like_marry_status` varchar(20),
  `like_baby_plan` varchar(30),
  `like_income` varchar(30),
  `like_house_car` varchar(30),
  `self_view_text` text COMMENT '个人三观自述：世界观/人生观/价值观',
  `target_view_text` text COMMENT '期待对方三观要求',
  `last_edit_time` datetime NULL COMMENT '最后修改时间（控制7天冷却）',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户择偶设置表（含三观文本匹配）';

-- 4.合伙人表（含推广统计、授权状态、专属推广码）
CREATE TABLE IF NOT EXISTS `partner` (
  `id` int NOT NULL AUTO_INCREMENT,
  `circle_id` int NOT NULL UNIQUE COMMENT '绑定唯一圈层',
  `name` varchar(50) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `password` varchar(100) NOT NULL COMMENT '后台登录密码',
  `status` tinyint DEFAULT 0 COMMENT '0待管理员授权 1正常上岗 2禁用',
  `promote_code` varchar(50) NOT NULL UNIQUE COMMENT '合伙人专属唯一推广码',
  `total_promote_user` int DEFAULT 0 COMMENT '累计推广注册用户数',
  `total_promote_vip` int DEFAULT 0 COMMENT '累计推广付费会员数',
  `total_commission` decimal(10,2) DEFAULT 0.00,
  `balance` decimal(10,2) DEFAULT 0.00,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='圈层合伙人（含推广数据统计）';

-- 5.会员订单分润表
CREATE TABLE IF NOT EXISTS `user_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `order_no` varchar(50) NOT NULL UNIQUE,
  `price` decimal(10,2) NOT NULL DEFAULT 188.00,
  `partner_commission` decimal(10,2) NOT NULL DEFAULT 94.00,
  `platform_income` decimal(10,2) NOT NULL DEFAULT 94.00,
  `circle_id` int NOT NULL,
  `partner_id` int NOT NULL COMMENT '分润归属推广合伙人',
  `pay_status` tinyint DEFAULT 0 COMMENT '0未付1已付',
  `pay_time` datetime NULL,
  `settle_status` tinyint DEFAULT 0 COMMENT '0未结算1已结算',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `partner_id` (`partner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员订单分润表';

-- 6.AI匹配记录表（新增三观契合度记录字段）
CREATE TABLE IF NOT EXISTS `user_match_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `match_user_id` int NOT NULL,
  `view_similarity` int DEFAULT 0 COMMENT '三观契合度百分比0-100',
  `match_date` date NOT NULL,
  `match_type` varchar(10) NOT NULL COMMENT '周三/周五',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI匹配记录（含三观契合度）';

-- 7.婚姻报备注销表
CREATE TABLE IF NOT EXISTS `marry_report` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `report_type` tinyint NOT NULL COMMENT '1结婚注销 2离异复入申请',
  `proof_img` varchar(255) DEFAULT '' COMMENT '离婚证明(仅复入)',
  `audit_status` tinyint DEFAULT 0 COMMENT '0待审1通过2驳回',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='婚姻报备记录';

-- 8.平台数据统计表
CREATE TABLE IF NOT EXISTS `system_stat` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marry_success_count` int DEFAULT 0 COMMENT '累计领证对数',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台数据统计';
INSERT INTO `system_stat`(`marry_success_count`) VALUES (0);

-- 9.合伙人提现记录表
CREATE TABLE IF NOT EXISTS `partner_withdraw` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partner_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` tinyint DEFAULT 0 COMMENT '0待处理1已结算',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人提现记录';

-- 10.用户隐私合规授权日志表
CREATE TABLE IF NOT EXISTS `user_privacy_auth_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openid` varchar(100) NOT NULL,
  `user_id` int DEFAULT 0,
  `auth_service` tinyint NOT NULL DEFAULT 0 COMMENT '1已同意用户协议',
  `auth_privacy` tinyint NOT NULL DEFAULT 0 COMMENT '1已同意隐私政策',
  `auth_data` tinyint NOT NULL DEFAULT 0 COMMENT '1已同意数据授权',
  `device_info` varchar(255) DEFAULT '' COMMENT '设备信息',
  `auth_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
  PRIMARY KEY (`id`),
  KEY `openid` (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户隐私合规授权日志表';

-- 11.AI客服会话日志表
CREATE TABLE IF NOT EXISTS `ai_chat_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `user_content` text NOT NULL COMMENT '用户提问',
  `ai_content` text NOT NULL COMMENT 'AI回复',
  `is_manual_transfer` tinyint DEFAULT 0 COMMENT '0否1是转接人工',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI客服会话日志';

-- 12.AI客服知识库表
CREATE TABLE IF NOT EXISTS `ai_knowledge` (
  `id` int NOT NULL AUTO_INCREMENT,
  `question` varchar(255) NOT NULL COMMENT '用户问题关键词',
  `answer` text NOT NULL COMMENT 'AI自动回复内容',
  `status` tinyint DEFAULT 1 COMMENT '1启用0禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI客服知识库';

-- 13.openid 黑名单（注册拦截）
CREATE TABLE IF NOT EXISTS `openid_blacklist` (
  `openid` varchar(100) NOT NULL,
  `reason` varchar(255) DEFAULT '',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='openid黑名单';

-- 14.超级管理员表
CREATE TABLE IF NOT EXISTS `admin` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL UNIQUE,
  `password` varchar(100) NOT NULL,
  `role` varchar(30) NOT NULL DEFAULT 'super_admin' COMMENT 'super_admin/customer_service/finance/auditor',
  `status` tinyint DEFAULT 1,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超级管理员';

-- 默认管理员 admin / admin123456（bcrypt 哈希）
INSERT INTO `admin` (`username`, `password`, `role`, `status`) VALUES
('admin', '$2a$10$t9YCAITJUYtWHJBqdwYfQ.nQKnqCyjLKUduU/1kdNSyza45nUmS5.', 'super_admin', 1);

-- AI 客服知识库初始 FAQ（会员、匹配、规则、奔现、订单、注销）
INSERT INTO `ai_knowledge` (`question`, `answer`, `status`) VALUES
('会员权益有哪些', 'WeFinally 月度 VIP 会员 188 元/30 天，不自动续费。权益包括：每周三、周五 AI 精准匹配 1 位对象；查看匹配详情与三观契合度；平台一对一私密奔现对接服务。到期后权限自动回收。', 1),
('如何开通会员', '进入小程序「个人中心」→「开通会员」，支付 188 元即可完成开通，有效期 30 天。支付成功后即时生效，无需等待审核。', 1),
('会员到期后会怎样', '会员到期后 is_vip 权限自动回收，不再参与 AI 定时匹配。已匹配记录仍可查看，但无法获得新匹配。可随时再次购买续费。', 1),
('匹配规则是什么', '系统每周三 0:00、周五 0:00 自动为有效 VIP 会员空投 1 位匹配对象，每周固定 2 次，无手动刷新。匹配权重：婚育节奏 > 三观文本相似度 > 年龄身高 > 学历 > 圈层 > 同城。', 1),
('择偶设置多久能改一次', '全套择偶配置（含「我的三观自述」「期待对方三观」）修改后 7 天内不可再次保存，前端会显示冷却倒计时。个人基础资料（性别、身高等）可随时修改。', 1),
('三观契合度怎么算', '系统分析双方「三观自述」与「期待对方三观」文本，计算关键词与婚恋理念相似度，生成 0-100 契合度分值。前台仅展示百分比，不展示原文以保护隐私。', 1),
('平台规则有哪些', '1. 禁止上传图片视频，无头像相册；2. 用户间无私聊社交；3. 仅 VIP 参与匹配；4. 违规永久封号不退费；5. 结婚可自主报备注销；6. 离异用户需管理员审核恢复。', 1),
('奔现怎么安排', '匹配成功后，平台提供官方一对一私密奔现对接服务，不组织线下活动或多人相亲。具体对接方式请通过 AI 客服或匹配详情页指引联系平台工作人员。', 1),
('如何查看订单', '在「个人中心」→「我的订单」可查看会员购买记录、支付状态与金额。如有疑问可联系 AI 客服，提供订单号以便查询。', 1),
('分润和合伙人', '用户通过合伙人推广码注册后，归属永久锁定。会员订单平台与推广合伙人 50/50 分润，T+7 结算。普通用户端不展示任何合伙人入口。', 1),
('如何注销账号', '已结婚用户可在「婚姻报备」提交结婚注销申请，审核通过后账号永久注销并退出匹配池。其他注销需求请联系 AI 客服或平台人工处理。', 1),
('离异用户如何恢复', '离异用户无自助恢复入口。需提交离异复入申请并上传证明，由管理员人工审核通过后方可恢复匹配权限，全程留痕。', 1),
('隐私和数据安全', '注册须独立勾选《用户服务协议》《隐私政策》《个人信息授权协议》，授权记录永久留存。您的信息仅用于婚恋匹配，不向其他用户公开完整三观原文。', 1);

-- 合伙人用户审核留痕
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

SET FOREIGN_KEY_CHECKS = 1;
