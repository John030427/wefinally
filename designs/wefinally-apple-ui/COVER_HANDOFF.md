# WeFinally Apple UI 封面交接

## 直接使用的封面文件

- 综合预览封面：`cover.png`
- 纯主界面封面：`cover-main-image.png`

主会话如果要“切换成这版封面”，优先看 `cover-main-image.png`，因为它只保留了用户给的主视觉，不带其它页面拼图。

## 设计稿 / UI 原型文件

- 可交互设计稿：`Apple Style Mobile Prototype.html`
- 本地预览地址：`http://127.0.0.1:4311/wefinally-apple-ui/Apple%20Style%20Mobile%20Prototype.html`
- 主视觉资产：`wefinally-main-cropped.jpg`

这里的设计稿是 HTML 原型，不是微信小程序代码。它用于确认视觉方向、页面状态、配色和交互节奏。

## 落到小程序时要改的文件类型

微信小程序真实 UI 不是 HTML，而是：

- 结构：`.wxml`
- 样式：`.wxss`
- 交互逻辑：`.js`
- 页面配置：`.json`

主界面/封面落地时，优先改：

- `miniprogram/pages/welcome/*`
- `miniprogram/pages/login/*`

如果要继续把 Apple 风格同步到业务页，再按原型改：

- `miniprogram/pages/index/*`
- `miniprogram/pages/match-detail/*`
- `miniprogram/pages/profile/*`

## 给主会话的建议指令

请在代码根目录 `D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目` 读取 `AGENTS.md`，参考 `designs/wefinally-apple-ui/Apple Style Mobile Prototype.html` 和 `designs/wefinally-apple-ui/cover-main-image.png`，先把小程序 welcome/login 主界面切换为这版 WeFinally 粉紫主视觉封面。保持业务接口不变，只改 WXML/WXSS/必要 JS 状态。完成后用微信开发者工具预览登录页和首页跳转。
