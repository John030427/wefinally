# 合伙人邀请与会员审核部署说明

## 云数据库

创建并设置为仅云函数可读写：

- `member_applications`
- `partner_user_audit_logs`
- `partners`
- `admins`

旧 MySQL 数据可通过 `tools/cloudbase/export-mysql-to-cloud-json.js` 导出，其中已包含 `member_application -> member_applications`。

## api 云函数

配置环境变量：

```text
BACKOFFICE_TOKEN_SECRET=<至少32字符的随机密钥>
BACKOFFICE_CORS_ORIGIN=<后台实际HTTPS来源>
MINIPROGRAM_ENV_VERSION=trial
```

重新上传 `cloudfunctions/api` 并选择云端安装依赖。HTTP访问服务需要映射到该函数，供合伙人和管理员后台访问会员审核接口。

## 后台切换云端会员审核

管理员或合伙人后台地址附加：

```text
?cloudApi=<api云函数HTTP根地址>
```

后台的订单、分润等原功能继续使用 Express；会员申请、审核、转交和邀请小程序码改走云数据库。登录时会分别取得旧后台Token和云端会员审核Token。

## 上线前检查

- 云数据库中存在启用的合伙人及其唯一 `promote_code`。
- 云数据库中存在启用的管理员，密码为 bcrypt 哈希。
- `api/config.json` 的 `wxacode.getUnlimited` 权限已随函数部署。
- 新用户无邀请码不能注册；旧 `status=1` 用户按兼容规则视为已审核。
