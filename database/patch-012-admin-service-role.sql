-- 后台角色权限：超级管理员 / 客服 / 财务 / 审核
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `admin` ADD COLUMN `role` varchar(30) NOT NULL DEFAULT ''super_admin'' COMMENT ''super_admin/customer_service/finance/auditor'' AFTER `password`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'admin'
    AND COLUMN_NAME = 'role'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `admin`
SET `role` = 'super_admin'
WHERE `role` IS NULL OR `role` = '';
