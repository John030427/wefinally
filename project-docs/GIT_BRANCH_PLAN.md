# Git 分支管理方案

> 最后更新：2026-06-29

> ⚠️ **前置状态（2026-06-29 核对）**：当前项目目录**尚未初始化为 git 仓库**（无 `.git`）。下文分支模型是**目标方案**，落地前需先 `git init`、建首个 commit、配 `.gitignore`（至少忽略 `server/node_modules`、`server/.env`）。在此之前，「分支/PR/合并」均无法执行。建议作为 R0 的一部分先把仓库初始化掉。

---

## 一、分支模型

```
main          ← 稳定可部署、可审核版本
  ↑
dev           ← 日常集成开发
  ↑
feature/*     ← 功能开发
fix/*         ← Bug 修复
chore/*       ← 工程/文档/配置（无产品行为变更）
```

---

## 二、分支说明

| 分支 | 用途 | 合并目标 | 保护规则 |
|------|------|----------|----------|
| `main` | 生产/提审稳定版 | — | 仅 PR 合并；禁止直接 push |
| `dev` | 日常开发集成 | main（发版时） | PR + 基本自测 |
| `feature/<name>` | 新功能 | dev | 小步、可 review |
| `fix/<name>` | Bug/安全修复 | dev（紧急可 hotfix→main） | 说明影响范围 |
| `chore/<name>` | 文档、跑通、配置 | dev | 低风险 |

---

## 三、命名示例

```
feature/appearance-description
feature/meet-safety-mvp
feature/bidirectional-match
fix/withdraw-reject-status
fix/cancel-report-type
fix/jwt-cors-security
refactor/match-config-extract
chore/project-docs
chore/r0-local-run
```

---

## 四、工作流程

1. 从 `dev` 拉 `feature/*` 或 `fix/*`
2. 小步提交，每步更新 DEVELOPMENT_LOG
3. 自测通过后 PR → `dev`
4. 阶段里程碑（如见面安全 MVP）由 `dev` → `main`
5. 热修复：`fix/hotfix-xxx` 从 `main` 拉取，合并回 `main` 和 `dev`

---

## 五、提交信息规范

```
<type>(<scope>): <subject>

type:
  feat     新功能
  fix      Bug 修复
  refactor 重构（无功能变更）
  docs     仅文档
  chore    工程/依赖
  security 安全相关

scope 示例: match, user, profile, admin, config, docs

示例:
  fix(admin): correct withdraw reject status code
  feat(meet): add meet_report table and safety form page
  refactor(match): extract weights to matchConfig.js
  docs: add project-docs handover structure
```

---

## 六、与开发阶段对应

| 阶段 | 建议分支 |
|------|----------|
| 文档体系 | `chore/project-docs`（已完成，可合 dev） |
| R0 跑通 | `chore/r0-local-run` |
| R1 Bug | `fix/r1-known-bugs` |
| R2 配置 | `refactor/r2-config` |
| R3 安全 | `fix/r3-security` |
| 双向互配 | `feature/bidirectional-match` |
| 见面安全 | `feature/meet-safety-mvp` |
| 外貌描述 | `feature/appearance-description` |

---

## 七、注意事项

- 不要在大功能分支上长期偏离 `dev`
- 匹配逻辑、支付、分润改动必须写清测试说明
- `main` 上禁止未确认的 PRD 规则变更（如改价、改分润比例）
