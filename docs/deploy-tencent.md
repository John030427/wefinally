# WeFinally 婚恋小程序 — 腾讯云部署指南

本文档说明如何在腾讯云轻量应用服务器上，使用宝塔面板（BT Panel）部署 WeFinally 后端、MySQL 8.0、HTTPS 及域名配置。

---

## 一、服务器与环境要求

| 组件 | 版本要求 |
|------|----------|
| 操作系统 | CentOS 7+ / Ubuntu 20.04+ |
| 宝塔面板 | 7.x 或 8.x |
| MySQL | 8.0 |
| Node.js | 16.x 或 18.x（推荐 18 LTS） |
| Nginx | 宝塔自带 |
| 域名 | 已备案（微信小程序 request 合法域名须备案） |
| SSL | Let's Encrypt 或腾讯云 SSL 证书 |

---

## 二、购买与初始化腾讯云服务器

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/) → **轻量应用服务器** → 选购实例（建议 2核4G 起）。
2. 选择地域（建议与用户主要地域一致，如华南/华东）。
3. 安装 **宝塔 Linux 面板** 镜像，或自行安装宝塔：

```bash
# CentOS 示例（以宝塔官网最新脚本为准）
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh
```

4. 记录面板地址、用户名、密码，在安全组/防火墙放行：**80、443、8888（宝塔）、22（SSH）**。

---

## 三、宝塔安装 MySQL 8.0

1. 宝塔面板 → **软件商店** → 安装 **MySQL 8.0**。
2. 设置 root 密码，记录备用。
3. **数据库** → **添加数据库**：
   - 数据库名：`wefinally`
   - 用户名：`wefinally`（或自定义）
   - 访问权限：本地服务器
   - 字符集：`utf8mb4`

4. 导入初始化 SQL：

```bash
# SSH 登录服务器后
cd /www/wwwroot/wefinally
mysql -u wefinally -p wefinally < database/init.sql
# 再按文件名顺序执行 database/patch-00*.sql
```

或在宝塔 **phpMyAdmin** 中依次导入 `database/init.sql` 和 `database/patch-00*.sql`。

> **注意**：`database/init.sql` 为产品规格表结构（`user`、`partner`、`occupation_circle` 等）。若后端 `server/` 使用 `migrations/001_schema.sql` 另一套表名（`users`、`partners`），请与开发团队确认统一 schema 后再导入，避免表名不一致。

---

## 四、部署 Node.js 后端

### 4.1 安装 Node.js

宝塔 → **软件商店** → 搜索 **PM2 管理器** 或 **Node 版本管理器** → 安装 Node **18.x**（或 16.x）。

### 4.2 上传代码

将项目上传至 `/www/wwwroot/wefinally/`（含 `server/`、`miniprogram/`、`database/` 等目录）。

### 4.3 配置环境变量

在 `server/` 目录创建 `.env`：

```env
PORT=3000
NODE_ENV=production

# 数据库（与宝塔 MySQL 一致）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=wefinally
DB_PASSWORD=你的数据库密码
DB_NAME=wefinally

# JWT
JWT_SECRET=请替换为随机长字符串
JWT_EXPIRES_IN=7d

# 微信小程序
WX_APPID=你的小程序AppID
WX_SECRET=你的小程序AppSecret

# 微信支付（见 docs/wechat-pay.md）
WX_MCH_ID=商户号
WX_API_V3_KEY=APIv3密钥
WX_CERT_SERIAL=证书序列号
WX_NOTIFY_URL=https://api.yourdomain.com/api/wxpay/notify

# 管理员 bootstrap（可选，首次无管理员时使用）
ADMIN_USER=admin
ADMIN_PASS=admin123456

CORS_ORIGIN=*
```

### 4.4 安装依赖并启动

```bash
cd /www/wwwroot/wefinally/server
npm install --production
```

宝塔 **PM2 管理器** → 添加项目：

- 启动文件：`src/app.js`
- 项目目录：`/www/wwwroot/wefinally/server`
- 端口：`3000`

或使用命令行：

```bash
pm2 start src/app.js --name wefinally
pm2 save
pm2 startup
```

验证：

```bash
curl http://127.0.0.1:3000/api/common/health
```

---

## 五、Nginx 反向代理与 HTTPS

### 5.1 添加站点

宝塔 → **网站** → **添加站点**：

- 域名：`api.yourdomain.com`（API 域名）
- 根目录：可指向 `server/public` 或任意目录（主要做反代）

### 5.2 配置反向代理

站点设置 → **反向代理** → 添加：

- 目标 URL：`http://127.0.0.1:3000`
- 发送域名：`$host`

或手动编辑 Nginx 配置：

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate    /www/server/panel/vhost/cert/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/api.yourdomain.com/privkey.pem;

    # 管理后台静态页
    location /admin {
        alias /www/wwwroot/wefinally/server/public/admin;
        index index.html;
        try_files $uri $uri/ /admin/index.html;
    }

    location /partner {
        alias /www/wwwroot/wefinally/server/public/partner;
        index index.html;
        try_files $uri $uri/ /partner/index.html;
    }

    # API 反代
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5.3 申请 SSL 证书

站点设置 → **SSL** → **Let's Encrypt** 一键申请，或上传腾讯云证书。

强制 HTTPS：开启 **HTTP 跳转 HTTPS**。

---

## 六、域名与微信小程序合法域名

1. 微信公众平台 → **开发** → **开发管理** → **开发设置** → **服务器域名**。
2. 配置 **request 合法域名**：`https://api.yourdomain.com`
3. 如有支付回调，确保 `WX_NOTIFY_URL` 与备案域名一致且 HTTPS 可访问。

详见 [wechat-review.md](./wechat-review.md)。

---

## 七、管理后台访问地址

| 后台 | 地址 | 默认账号 |
|------|------|----------|
| 超级管理后台 | `https://api.yourdomain.com/admin/` | 见 `.env` 或 `database/init.sql` 中 admin 表 |
| 合伙人后台 | `https://api.yourdomain.com/partner/` | 合伙人注册后需管理员激活 |

> 超级管理后台默认（init.sql）：`admin` / `admin123456`（bcrypt 存储）。**上线后请立即修改密码。**

---

## 八、定时任务与进程守护

后端内置 Cron（匹配、VIP 过期、T+7 结算），随 Node 进程运行，无需额外 crontab。

确保 PM2 开机自启：

```bash
pm2 startup
pm2 save
```

---

## 九、常见问题

### 9.1 502 Bad Gateway

- 检查 PM2 进程是否运行：`pm2 list`
- 检查端口 3000 是否监听：`netstat -tlnp | grep 3000`

### 9.2 数据库连接失败

- 确认 `.env` 中 DB 配置与宝塔数据库一致
- MySQL 8 默认 `caching_sha2_password`，Node mysql2 已支持

### 9.3 跨域问题

管理后台与 API 同域部署（同 `api.yourdomain.com`）可避免 CORS。若分域，设置 `CORS_ORIGIN`。

### 9.4 微信支付回调失败

- 回调 URL 必须公网 HTTPS
- 微信商户平台配置相同 notify URL
- 详见 [wechat-pay.md](./wechat-pay.md)

---

## 十、上线检查清单

- [ ] MySQL 已导入 init.sql
- [ ] `.env` 生产配置完整且无泄露
- [ ] HTTPS 证书有效
- [ ] 微信合法域名已配置
- [ ] PM2 进程守护正常
- [ ] 管理后台可登录
- [ ] 健康检查 `/api/common/health` 返回 ok
- [ ] 默认管理员密码已修改

---

## 十一、备份建议

宝塔 → **计划任务**：

- 每日备份 MySQL 数据库 `wefinally`
- 每周备份 `/www/wwwroot/wefinally` 代码目录

完成以上步骤后，WeFinally 后端即可在腾讯云稳定运行。
