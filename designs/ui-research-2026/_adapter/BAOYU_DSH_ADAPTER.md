# BAOYU_DSH_ADAPTER — baoyu-design 方法论的 DSH 可调用产线适配器

> 来源：GOAL 第 4 条「将本地 baoyu-design 改造成 DSH 可调用的 design-exploration plugin/adapter；只用于 prototype」。
> 本目录是本轮六套视觉语言探索**实际跑通**的产线固化：SPEC 合同 → 并行方向制作者 → 截图管线 → 盲测评审。
> 定位：prototype 专用，**不用于正式小程序 UI 落地**（正式落地走 `wefinally-ui-design` skill 的 WXML/WXSS 规范）。

## 一、baoyu-design 原方法论 → DSH 环境的映射

| baoyu-design 概念 | DSH 适配实现 |
|---|---|
| Ask Questions 启动协议 | 用户指令 + 研究文档（RESEARCH_FINDINGS / UI_A~F）已锁定范围，免问询直入 |
| BOLD aesthetic direction 先行 | 每方向一份简报（UI_X_*.md）+ SPEC §3 差异维度矩阵强制互斥 |
| 自包含 HTML 交付物 | 纯静态单文件 HTML（无 React/Babel/CDN），headless 截图确定性渲染，GitHub 可直接浏览 |
| design canvas 并排画板 | 独立大图 + PROTOTYPE_INDEX 索引（390px 手机画布，非桌面 canvas 场景） |
| HTTP serve + 截图验证 | `python -m http.server 4311` + `_adapter/capture.ps1`（Chrome headless） |
| 多变体永不收敛纪律 | 盲测发散评审门禁（去标签可辨六套才算 PASS） |

## 二、产线五步（复现手册）

```
1. SPEC 合同     designs/ui-research-2026/SPEC.md
                 统一 mock 数据 + 产品红线 + 差异维度矩阵 + 工艺规范（反 AI slop 清单/CJK 规则/44px）
2. 并行制作      每方向一个隔离子代理：读 SPEC + 方向简报 + 已定稿页面 → 产出自包含 HTML
                 关键指令：body{max-width:390px;margin:0 auto}（headless 最小窗宽 512px 下保持画布居中）
3. 截图管线      _adapter/capture.ps1 -HtmlPath <file> -OutPng <png>
                 两段式：先探内容高度（解决 min-height:100vh 空白拉伸），再 512×H 渲染 → 居中裁回 390 逻辑带 → 2x 缩放 → 底部空白裁切
                 前置：python -m http.server 4311 --directory <repo-root> --bind 127.0.0.1
4. 溢出探针      _adapter/probe_overflow.ps1 -HtmlPath <file>（390 视口下列出越界元素，定位横向溢出）
5. 盲测门禁      12 张大图中性命名乱序 → 隔离评审员配对+辨识+评分 → PASS 才扩展 Top N
```

## 三、本轮踩坑实录（复用时必读）

1. **headless Chrome 最小窗宽 ≈512px**：`--window-size=390,…` 会被放大到 512 布局再按 390 左对齐裁切 → 右侧 61px 内容被切。解法：按 512 渲染、页面画布 `margin:0 auto` 居中、截图后居中裁回 390 逻辑带（物理 780px）。
2. **PowerShell 逗号参数陷阱**：`--window-size=$W,$H` 中变量+逗号会被拆成两个参数；必须先拼成单个字符串变量再传。
3. **`min-height:100vh` 截图伪影**：在超高截图窗口里 flex 空隔被拉出千像素空白；两段式高度探测后按内容高度截图即消失（真机 844px 视口无此问题）。
4. **子代理自行 commit**：并行制作者可能擅自 commit（本轮发生 2 次，均为仅含自己文件的合规提交）；主线提交前必须 `git log` 核对。
5. **反爬墙识别**：cos/arket（Akamai）与 dribbble（连接错误）的截图是拦截页不是参考——按字节大小+vision_glance 鉴别后剔除并记 blocker，不伪造样本。

## 四、升级为 DSH 插件的路径（未做，留待需要时）

当前形态=repo 内脚本+文档（零依赖、可移植）。若要变成可注入的 DSH 插件（`dev_scaffold_plugin` toolkit 形态）：
- 把 capture/probe 封装为插件工具（参数：html 路径、视口、缩放）
- 把 SPEC 模板 + 盲测协议做成 `design-explore` 命令对
- 触发词建议：「视觉探索」「多风格方案」「divergence review」
本轮不做：避免在研究分支引入运行时插件依赖；脚本已可直接被任何 DSH 会话调用。
