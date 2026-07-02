# WeFinally 微信小程序前端

原生微信小程序用户端完整源码，**不含后端、不含数据库**。合伙人相关入口对普通用户完全隐藏。

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss
├── project.config.json
├── utils/
│   ├── constants.js    # 常量、API 路径、枚举选项
│   ├── request.js      # 网络请求封装
│   └── util.js         # 冷却倒计时、契合度配色等工具
└── pages/
    ├── welcome/          欢迎首页
    ├── login/            微信一键登录
    ├── agreement/        三项合规协议（无默认勾选）
    ├── register/         注册（全下拉选择）
    ├── match-setting/    择偶配置（双三观文本 + 7天冷却）
    ├── index/            AI 匹配首页（定时匹配，无手动刷新）
    ├── match-list/       匹配记录
    ├── match-detail/     匹配详情（三观契合度进度条）
    ├── vip/              188元/30天会员
    ├── profile/          个人中心
    ├── chat/             AI 智能客服
    ├── marry-report/     婚姻报备
    ├── marry-stat/       领证数据公示
    ├── account-cancel/   账号注销
    └── rules/            平台规则/协议详情
```

## 使用前配置

1. 微信开发者工具导入本目录
2. 修改 `project.config.json` → `appid`
3. 修改 `app.js` → `globalData.API_BASE_URL` 为后端 API 地址
4. 开发阶段可在开发者工具中勾选「不校验合法域名」
5. 若暂无真实 `WX_SECRET`，可在后端 `server/.env` 临时设置 `DEV_WX_LOGIN_ENABLED=true` 后重启后端，用本地 dev openid 跑通登录/注册/页面流程；该开关默认关闭，生产环境无效。

## 页面说明

| 页面 | 核心功能 |
|------|----------|
| 协议页 | 三项协议独立勾选，未全选禁止继续 |
| 注册页 | 性别/年份/身高/学历/圈层/城市/婚育等全下拉 |
| 择偶配置 | 【我的三观自述】【期待对方三观】20-300字 + 实时字数 + 7天冷却倒计时 |
| 匹配首页 | 展示下次匹配时间（周三/周五），无手动匹配按钮 |
| 匹配详情 | 三观契合度 0-100% 进度条（绿/灰/橙），不展示原文 |
| VIP | 188元/30天，权益明细，微信支付调起 |
| AI客服 | 仅平台客服，无用户私聊 |

## 设计规范

- 无 `<image>` 组件、无头像、无上传
- 无合伙人入口、链接、按钮
- 全页面 loading / empty / error / no-network 兜底
- 主色 `#FF6B8A`，移动端适配 + safe-area

## API 依赖

前端通过 `utils/request.js` 调用后端 REST API，需后端提供对应接口。主要路径见 `utils/constants.js` → `API_PATHS`。
