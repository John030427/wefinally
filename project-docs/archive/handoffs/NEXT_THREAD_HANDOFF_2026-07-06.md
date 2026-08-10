# WeFinally 下个会话交接与笔记本迁移指南（2026-07-06）

## 1. 当前项目定位

WeFinally 是一个微信婚恋小程序，核心方向是“少社交、重筛选、AI 辅助匹配、线下安全确认”。当前会话中，角色已切换为项目架构师/产品策划/工程实现共同推进。

下个会话请先读：

- `project-docs/NEXT_THREAD_HANDOFF_2026-07-07.md`
- `project-docs/NEXT_THREAD_HANDOFF_2026-07-06.md`
- `project-docs/USER_TEST_GUIDE_2026-07-04.md`
- `project-docs/DEVELOPMENT_PROGRESS.md`
- `project-docs/TODO.md`

当前工作区有大量未提交改动，不要执行 `git reset --hard`、`git checkout -- .` 等覆盖命令。

## 2. 当前已经做到的程度

### 2.1 小程序主链路

- 登录/欢迎页已换成粉蓝猫头品牌封面。
- 微信登录、本地开发登录、协议确认、注册资料、择偶配置、匹配首页、匹配记录、匹配详情、我的页面均已有可测试页面。
- 注册资料已加入外貌描述相关字段。
- “公益免费认证”方向已调整为更像激活码/白名单/免费会员的口径，避免文案怪异。
- 首页已加入“安全求助”入口，方便用户随时呼救。

### 2.2 匹配系统

匹配系统已重构为完整链路：

- 样本数据库
- 算法匹配
- Mock AI 排序
- Mock AI 报告
- 可复验结果导出

后端脚本：

```bash
cd server
npm run sample:match-clear
npm run sample:match-seed
npm run sample:match-run
npm run sample:match-e2e
```

样本目录：

```text
server/sample-data/matching-system/
```

关键设计：

- 新评分版本：`algo_evidence_v2`
- 双向互惠排序，不只看单方高分
- 关系偏好用兼容矩阵，不再简单“相同满分/不同零分”
- 外貌偏好进入匹配评分
- AI 排序和 AI 报告默认可用 Mock，避免真实模型成本和随机性

### 2.3 AI 报告展示

- AI 报告已放到匹配详情的综合匹配信息下面、字段拆解前面。
- 字段拆解支持解释，后续方向是做成用户点开下拉解释“为什么是这个分数”。
- 报告文案原则：不展示具体分数、不泄露收入/职位/单位/外貌原文，不冒充心理诊断。

### 2.4 后台管理

后台地址：

```text
http://localhost:3000/admin
```

默认本地管理员：

```text
admin / admin123456
```

后台已增强用于查看用户、匹配记录、双方信息、AI 报告状态等，便于分析为什么匹配失败。

### 2.5 见面安全与广东 110

当前安全能力：

- 见面安全报备
- 获取一次定位并留存
- 紧急联系人
- SOS 证据记录
- 首页安全求助入口
- 见面安全页 SOS
- 广东110小程序跳转
- 跳转失败时弹出错误详情，引导微信搜索“广东110”并复制名称

广东110 AppID 已配置：

```text
wxf654be7f2931bfcb
```

本地配置在：

```text
server/.env
```

相关环境变量：

```env
GUANGDONG_110_ENABLED=true
GUANGDONG_110_APP_ID=wxf654be7f2931bfcb
GUANGDONG_110_PATH=
```

`GUANGDONG_110_PATH` 暂时为空，会尝试打开广东110首页。拿到官方具体报警页面路径后再补。

注意：当前只是单次定位，不是实时轨迹。微信能做前台实时定位，也有后台定位接口，但后台定位需要额外授权、接口申请和类目审核，婚恋类目不一定能过。建议下一步先做“用户主动开启的前台安全守护”。

## 3. 本地运行方式

### 3.1 后端

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\server
npm install
node src/app.js
```

服务监听：

```text
0.0.0.0:3000
```

健康检查：

```text
http://127.0.0.1:3000/api/common/health
http://<电脑IPv4>:3000/api/common/health
```

### 3.2 数据库

数据库脚本目录：

```text
database/
```

推荐在新电脑运行：

```bat
database\import.bat
```

它会导入：

- `init.sql`
- `patch-002-partner-audit.sql`
- `patch-004-free-whitelist.sql`
- `patch-005-meet-report.sql`
- `patch-006-appearance-llm.sql`
- `patch-007-register-ux.sql`
- `patch-008-match-psych-report.sql`
- `patch-009-safety-whitelist-audit.sql`

### 3.3 微信开发者工具

导入目录：

```text
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\miniprogram
```

本地模拟器默认 API：

```text
http://127.0.0.1:3000
```

真机不能用 `127.0.0.1`。

## 4. 笔记本继续开发怎么迁移

结论：可以把整个项目文件夹复制到笔记本，但“复制文件夹”只复制代码和资源，不会自动复制运行环境和数据库服务。

### 4.1 推荐复制范围

复制整个目录：

```text
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
```

至少必须包含：

- `miniprogram/`
- `server/`
- `database/`
- `project-docs/`
- `designs/`

`server/node_modules/` 可以不复制，到笔记本后重新执行 `npm install`。

### 4.2 笔记本必须安装

- 微信开发者工具
- Node.js 18 或以上
- MySQL
- Git 可选，但建议装

Docker 不是本地真机测试的必需品。只有后续上微信云托管/统一容器环境时才更重要。

### 4.3 笔记本迁移步骤

1. 复制整个项目文件夹到笔记本。
2. 安装 Node.js 和 MySQL。
3. 运行 `database\import.bat` 导入数据库。
4. 检查 `server/.env`，重点是：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的笔记本MySQL密码
DB_NAME=wefinally
PORT=3000
DEV_WX_LOGIN_ENABLED=true
DEV_WX_OPENID=dev_wefinally_local_openid
DEV_MATCH_START_ENABLED=true
GUANGDONG_110_ENABLED=true
GUANGDONG_110_APP_ID=wxf654be7f2931bfcb
```

5. 启动后端：

```bash
cd server
npm install
node src/app.js
```

6. 微信开发者工具导入 `miniprogram/`。
7. 手机和笔记本连接同一个 Wi-Fi，或笔记本连接手机热点。
8. 在微信开发者工具 Console 执行：

```js
getApp().setApiBaseUrl('http://笔记本IPv4:3000')
getApp().debugApiHealth()
```

弹出 `API 连接成功` 后，就可以真机测试。

## 5. 真机测试判断

手机和笔记本在同一局域网时，可以访问：

```text
http://笔记本IPv4:3000
```

不同局域网时，本地 `3000` 不可访问。解决方式：

- 让两台设备连同一个 Wi-Fi
- 用手机热点给笔记本
- 用内网穿透
- 后端部署到公网 HTTPS 或微信云托管

## 6. 微信云托管方向

如果后续要上云，建议用微信云托管/CloudBase Run，而不是把 Express 后端拆成一堆云函数。

原因：

- 现有后端是 Node.js + Express
- 已有路由、静态后台、cron、MySQL 连接
- 云托管更接近当前结构

上云需要处理：

- Dockerfile 或云托管构建配置
- 云端 MySQL
- 环境变量
- 微信 AppID/Secret
- 合法域名或 `wx.cloud.callContainer`
- 管理后台访问方式

不要把“小程序上传体验版”等同于“后端也上云”。小程序前端和后端是两件事。

## 7. 测试手册地址

完整测试手册：

```text
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\project-docs\USER_TEST_GUIDE_2026-07-04.md
```

虽然文件名还是 `2026-07-04`，标题已更新为：

```text
WeFinally 小程序完整测试指南（2026-07-05）
```

里面已补充：

- 清空开发者工具缓存，模拟初始注册
- 真机网络失败排查
- 同局域网真机测试
- 总管理员后台入口
- 广东110 AppID 配置
- 匹配系统、注册、VIP、安全、后台等测试流程

## 8. 下个会话优先事项

建议下一步顺序：

1. 在笔记本完成本地后端和数据库迁移。
2. 手机和笔记本同局域网，跑通 `debugApiHealth()`。
3. 按测试手册完整测试注册、VIP/激活码、匹配、AI报告、见面安全、后台。
4. 根据真机测试结果修 bug。
5. 再决定是否做前台实时安全守护。
6. 功能稳定后，再做微信云托管/UAT 环境。
