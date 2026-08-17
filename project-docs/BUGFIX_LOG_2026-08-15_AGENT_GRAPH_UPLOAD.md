# Bugfix Log — agent-graph 云函数上传报"非法的文件"

> 日期：2026-08-15
> 定位：Claude Code（配合 John 排查）
> 修复提交：`fec4215`（分支 `feature/partner-gated-aigc-plan`，worktree `D:\wefinal\.worktrees\wefinally-ai-agent`）
> 前置提交：`b622229`（Cursor Agent，同日 15:46）

---

## 一、报错现象

微信开发者工具上传/编译云函数时提示：

```
Error: 非法的文件，错误信息：invalid file: cloudfunctions/agent-graph/dist/test/cloudFunctionContract.test.js
SyntaxError: Cannot use 'import.meta' outside a module
```

appid `wx91c6559ea4490a29`，发生时间 2026-08-15 15:58:19。

## 二、根因

1. agent-graph 云函数（AI 客服 LangGraph 编排，`miniprogram/cloudfunctions/agent-graph/`）旧 `tsconfig.json` 的 `include` 含 `test/**/*.ts`，**测试文件被 tsc 编译进 `dist/test/`**。
2. 编译产物为 babel CJS 格式，但保留 `import.meta` 语法（CJS 下非法）。
3. 微信开发者工具上传时逐个 .js 做语法检查，命中该文件即中断报错。

> 注：agent-graph 位于 worktree（`D:\wefinal\.worktrees\wefinally-ai-agent`）分支 `feature/partner-gated-aigc-plan`，**不在主工作区** `miniprogram/cloudfunctions/` 下（那里只有 api / login / report-worker）。微信开发者工具打开的是 worktree 的 miniprogram 目录。

## 三、修复内容（fec4215）

| 文件 | 改动 |
|------|------|
| `miniprogram/tests/agent-graph/` | 测试源文件从 `agent-graph/test/` 外移至此（8 个，git rename 无损） |
| `agent-graph/tsconfig.json` | include 仅 `src/**/*.ts`，不再编译 test |
| `agent-graph/build-dist-package.cjs` | 构建前 `rmSync(dist)` 清空，保证 dist 从干净状态重建 |
| `agent-graph/package.json` | build 脚本在 tsc 后再次删除 `dist/test`（双保险）；test 指向新路径 `../../tests/agent-graph/*.test.ts` |
| `agent-graph/.ignore` | 上传排除 `test/`、`dist/test/`、`**/*.test.*`、`*.map`、`src/`、`tsconfig.json`、构建脚本等 |

前置提交 `b622229` 已先做 .ignore 基础版 + tsconfig exclude + build 脚本删 dist/test；fec4215 补强（clean-slate 构建、全量 test 文件排除、测试外移）。

## 四、验证结论（2026-08-15 排查时）

- ✅ `dist/test/` 已不存在（15:57 重建后）
- ✅ dist 内无 `import.meta` 残留（仅 ESM 格式的 `dist/src/*.js`，入口 `index.js` 用 `await import('./dist/src/cloudFunction.js')` 动态加载，Node >= 20，设计自洽）
- ✅ 8 个测试文件全部外移，无丢失

## 五、人工操作指引（给 John）

1. 微信开发者工具：菜单「工具 → 清除全部缓存」或重启开发者工具（报错可能来自旧文件快照缓存）。
2. 确认打开的项目目录为 `D:\wefinal\.worktrees\wefinally-ai-agent\miniprogram`。
3. 重新上传云函数 `agent-graph`，应不再报"非法的文件"。

## 六、未纳入本次修复（保持原样）

- worktree 中 Cursor 未提交的现场改动：`server/public/partner/index.html`、`server/selfcheck/*`（cloudbase-partner-connection、customer-service-browser-*）、`specs/2026-08-12-partner-gated-launch/`、`project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md` —— 与本次报错无关，未动。
- agent-graph 分支（`feature/partner-gated-aigc-plan`）是否合并进主分支：待 John 决策。
