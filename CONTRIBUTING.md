# WeFinally 双人 GitHub 协作规范

## 1. 仓库设置

- 使用私有 GitHub 仓库。
- `main` 设为受保护分支：禁止直接推送，至少 1 人审批，合并前必须通过自检。
- 每个人使用自己的 GitHub 账号和分支，不共享 Token，不共同开发同一条分支。
- 生产密钥只放 GitHub Environments/Secrets 或 CloudBase 密钥配置，不放仓库。

私有仓库为 `John030427/wefinally`，默认分支为受保护的 `main`。远端使用经过 Gitleaks 审计的无旧历史基线；禁止把本机旧分支、旧标签或旧提交推到该远端。

## 2. 分支命名

建议格式：

```text
feature/<功能>
fix/<问题>
docs/<文档>
chore/<工程整理>
```

一个分支只处理一个主题。支付、会员、匹配算法、云函数部署和数据库迁移不要混在同一个 PR。

## 3. 每天开始

```powershell
git fetch origin
git switch main
git pull --ff-only
git switch -c feature/short-task-name
```

若分支已存在：

```powershell
git switch feature/short-task-name
git fetch origin
git rebase origin/main
```

只在自己的工作树干净、且确认没有覆盖他人工作时 rebase。当前这个历史脏工作树不得直接照搬上述命令。

## 4. 提交与 PR

- 提交要小而清楚，避免把格式化、功能、生成物混在一起。
- 不提交 `.env`、私钥、Token、数据库导出、`.deploy/`、个人开发者工具配置或 `node_modules/`。
- PR 描述必须包含：目的、关键文件、测试结果、截图/真机证据、数据影响、部署影响和回滚方式。
- 审阅者重点检查权限边界、隐私字段、支付状态、幂等性、数据库写入和云端/客户端版本差异。

推荐提交信息：

```text
fix(match): normalize legacy match score display
feat(agent): add redacted top-k rerank policy
docs(collab): add github handoff workflow
```

## 5. 合并前验证

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
git diff --check
```

涉及小程序 UI 或交互时，还要完成开发者工具编译和相关真机流程。涉及支付、登录、订阅消息、定位时不能只以模拟器结果作为上线依据。

## 6. 冲突处理

1. 暂停继续修改冲突文件。
2. 在 PR/聊天中说明冲突文件和双方意图。
3. 由该模块负责人合并语义，不能简单选择“ours/theirs”覆盖另一方。
4. 重新运行相关自检，再继续评审。

## 7. 发布责任

每次发布指定一名负责人：

- 云函数负责人只部署已审核提交，并核对云端版本。
- 客户端负责人只上传相同发布候选提交构建的小程序。
- 两个动作分别记录，不用“已部署”笼统代替。
- 生产数据修复只走白名单业务服务和审计按钮，不在控制台直接改库。
