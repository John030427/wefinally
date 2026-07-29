# WeFinally 前端 UI 规格（供设计查看/调试）

> 用途：把小程序每个页面的布局、状态、交互写成线框规格，便于在设计工具里渲染查看与调设计。
> 反映当前代码（含 wave2 详情字段收紧、安全卡已撤、见面安全 110 方案一）。
> 标注：⭐=本轮新增/改动、重点看；其余为既有页（结构取自 UI_REVIEW + 代码）。

---

## 0. 全局设计令牌（app.wxss，渲染请照此配色）

| 令牌 | 值 |
|------|----|
| 品牌主色 | `#FF6B8A`；主按钮渐变 `135deg, #FF6B8A → #FF8FA3` |
| 页面背景 | `#F8F4F5`；文字 `#333`；次要文字 `#888/#999` |
| 卡片 `.card` | 白底、圆角 `16rpx`、内边距 `32rpx`、浅阴影 |
| 主按钮 `.btn-primary` | 粉色渐变、胶囊圆角 `48rpx`、高 `88rpx`、白字；disabled 变灰 |
| 次按钮 `.btn-secondary` | 白底、粉描边、胶囊 |
| 标签 `.tag` | `tag-pink`(品牌) / `tag-gray`(中性) / `tag-green` / `tag-orange` |
| 进度条 `.progress-bar` | 三观契合度用；`progress-green ≥80 / gray 50-79 / orange <50` |
| 字号 | 正文 `28rpx`；页标题 `40rpx/600`；卡内标题 `30-32rpx`；大数字 `72rpx` |
| 容器 `.container` | 全屏、内边距 `32rpx` |
| 通用状态块 `.state-wrap` | 加载/空/错/无网：居中图标 emoji + 文案 +(可选)重试按钮 |

**底部 tabBar**（3 项，选中色 `#FF6B8A`）：匹配(index) · 记录(match-list) · 我的(profile)

---

## 1. 注册漏斗（welcome → login → agreement → register）

### welcome 品牌欢迎页
```
[自定义导航/品牌区]
   WeFinally  ❤
   一句 slogan：专门解决想结婚的单身朋友
   [ 微信一键登录 ]  (btn-primary)
```
状态：纯静态。交互：点登录 → login。

### login 微信登录
```
品牌图标
[ 微信授权登录 ]  → wx.login → /api/auth/wx-login
```
状态：login 全态。返回 needRegister → 跳 agreement/register；老用户 → 首页。

### agreement 三协议勾选
```
.card 协议说明
☐ 我已阅读并同意《用户服务协议》
☐ 《隐私政策》
☐ 《个人信息授权协议》
[ 同意并继续 ]  (三个都勾才可点)
```
交互：勾选写本地 storage；继续 → register。

### ⭐register 极简注册（全下拉；身高已改区间档位）
```
.page-title 完善资料
.card
  性别        [男 ▾]
  出生年份    [1995年 ▾]
  城市        [深圳 ▾]
  学历        [本科 ▾]
  收入(选填)  [选择 ▾]
  婚况        [未婚 ▾]
  婚育节奏    [3-5年内 ▾]
  车房(选填)  [选择 ▾]
  身高        [170-180cm ▾]   ← ⭐区间档位(原来是精确cm)
  职业圈层    [程序员… ▾]
[ 提交注册 ]
```
状态：全态(加载圈层失败可重试)。交互：picker 选择；提交 → /api/user/register → 进 match-setting。

---

## 2. 匹配主线（index / match-list / match-detail / match-setting / vip）

### ⭐index 匹配首页（tab）
```
.hero-card  AI 定时精准匹配
   每周三、周五 0:00 自动空投 1 位
   下次匹配时间：07月03日 周五 00:00   ← 动态算出(getNextMatchTime)
[VIP 横幅]  非VIP：开通VIP参与每周2次匹配  [188元/30天 开通]
            VIP：  VIP有效 · 到期 2026-..
.section 最近匹配                      全部记录 ›
  .match-card  [周五] 2026-.. / 女·31岁·深圳 / 三观契合度 78% / 查看详情 ›
  (空) 🎯 暂无匹配记录
.quick-actions  ⚙️择偶配置   📜平台规则
.notice  · 不支持手动刷新 · 用户间无私聊
```
状态：全态 + 内联空态。交互：点匹配卡 → match-detail；横幅 → vip。

### match-list 匹配记录（tab）
```
.list-item.card ×N
  [周五标签] 2026-.. 
  女 · 31岁 · 本科 · 圈层 · 契合度 78%
  ›
```
仅 VIP 看完整；非VIP 看 locked 简略(开通引导)。

### ⭐match-detail 匹配详情（字段已收紧 + 非VIP模糊）
```
.meta-card 匹配对象            [周五]
  匹配日期：2026-..
  ── VIP 看到（收紧后最小集）──
  [30-35岁] [170-180cm] [本科] [程序员(粉)] [3-5年内]
     ↑ 不再展示 性别/城市/精确身高/姓名/照片/联系方式
  ── 非VIP 看到（locked）──
  🔒 你有一位匹配对象，开通 VIP 查看完整匹配详情   [ 开通 VIP ]
.compat-card 三观契合度
  78 %   [高度契合]
  ▓▓▓▓▓▓▓░░  (颜色按分段)
  说明：仅展示百分比，不展示三观原文
  (非VIP/无分 → 💭 暂无契合度评估)
.meet-card 奔现对接
  官方一对一私密奔现对接；联系 AI 客服 ›
  [ 线下见面安全确认 ]  ← ⭐入口 → meet-safety
.privacy-note 为保护隐私，不展示完整三观原文
```

### match-setting 择偶+三观配置（7天冷却）
```
(冷却中)  .cooldown-banner 橙色：还需 X 天可修改
.card 择偶六维  年龄/身高/学历/城市/婚况偏好/婚育节奏 (picker)
.card 【我的三观自述】 textarea + 字数 20-300（选填，填了才校验）
.card 【期待对方三观】 textarea + 字数
.safe-bottom [ 保存 ]（冷却中禁用）
```

### vip 会员购买
```
.card 188 元 / 30 天   无自动续费
  权益列表：每周2次匹配 / 看契合度详情 / 官方对接奔现
[ 立即开通 ]  → wx.requestPayment（开发为 mock）
```

---

## 3. 我的（profile / marry-stat / marry-report / account-cancel / rules / chat）

### ⭐profile 我的（tab）
```
.user-card.card
  文字头像  女 · 31岁
  [本科] [深圳] [程序员] [3-5年内]
  (若免费会员) [公益免费认证]            ← ⭐
  VIP 有效/未开通
.menu-card
  ⚙️ 择偶配置
  👑 VIP 会员
  💒 领证数据公示
  📋 婚姻报备
  💬 AI 智能客服
  🎖️ 激活码兑换        ← ⭐ 点→弹框输手机号领取(claim-free)
  🛡️ 见面安全记录      ← ⭐ → meet-safety-list
  📜 平台规则
  ❌ 账号注销
[ 退出登录 ]
```

### marry-stat 领证公示
```
.card 居中大数字 1280 对
   平台累计帮助领证对数（匿名）
```

### marry-report 婚姻报备 / account-cancel 注销 / rules 平台规则
- marry-report：说明卡(橙) + 提交报备按钮（待审核）。
- account-cancel：⚠️警告卡 + 二次确认勾选 + 提交注销。
- rules：平台规则正文（8 条：无图/无私聊/周三五/188…）。

### chat AI 客服
```
聊天气泡流（.msg-row / .msg-bubble）
[输入框] [发送]   未命中→转人工
```

---

## 4. ⭐见面安全（110 方案一）— meet-safety / meet-safety-list（新增）

### ⭐meet-safety 见面安全确认（表单 → 提交确认）
```
── 未提交(form) ──
.card
  见面时间   [input 2026-06-29 19:30]
  见面地点   [input 公共场所名称/地址]
  定位       [获取定位]  → 22.5，114.0        ← wx.getLocation
  见面说明   [textarea 选填 ≤500]
  紧急联系人 [input 手机号 11位]
  ☐ 我已阅读线下见面安全提示（勾选才能提交）
  [ 提交安全确认 ]

── 提交后 ──
.card
  已提交见面安全确认
  预计时间 / 预计地点 / 定位 / 说明
  状态：安全守护未开启 / 已开启
  [ 开启安全守护 ]      ← wx.startLocationUpdate + wx.onLocationChange 前台上传轨迹
  [ 🆘 一键呼救 110 ]   ← 记录SOS + 拉起广东110小程序；失败则提示复制/搜索官方小程序
  (安全卡转发按钮已按老板要求撤掉)
```
交互：getLocation 需授权（工具里设模拟定位）；开启守护仅前台上传定位；呼救 → /api/meet/:id/sos → wx.navigateToMiniProgram 拉起广东110。

### ⭐meet-safety-list 见面安全记录（历史）
```
.list-item.card ×N
  [状态 tag] 2026-..(create_time)
  见面地点
  [见面时间 tag]
  ›
[ 新建记录 ]
```
（卡号标签已撤）。点项 → meet-safety?id= 查看。

---

## 5. 关键用户流程（给设计串场用）

```
welcome → login → (新)agreement → register → match-setting → index
index ──(VIP)──> match-detail ──> 奔现对接(AI客服) / 线下见面安全确认 → meet-safety → 🆘呼救
index ──(非VIP)─> match-detail(🔒模糊) → vip 开通
profile → 激活码兑换(输单位登记手机号领免费) / 见面安全记录 / 婚姻报备 / 注销
```

---

## 6. 设计调试备注
- 渲染请用第 0 节令牌；⭐ 页是本轮重点，先看这些。
- 真机交互(getLocation/广东110跳转/支付)只能在微信开发者工具/真机验，设计稿不涉及。
- 想要可点 HTML 原型(而非线框 md)，可另出 baoyu-design 版。
