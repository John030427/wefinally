# 计划 · 匹配两个小增强（跨批次去重 + 小池兜底）

> 执行：**Codex**（先读仓库根 `AGENTS.md`）逐 Task 实现 → 对照检查表自检。
> 前置：本地 MySQL 在跑、后端能启动。只动 `matchService.js` + `matchConfig.js`，不改产品机制/UI/分润。

**Goal**：① 不再把同一对人跨批次重复匹配；② 用户池小时可选放宽软分门槛（硬条件仍守），避免用户连续空手。两者都走 `matchConfig` 开关。

## Task 1：matchConfig 加两个开关

**Files:** Modify `server/src/config/matchConfig.js`

- [ ] 在 `module.exports = {` 内加：
```js
  avoidRematch: true,       // 跨批次去重：同一对已匹配过则不再配
  smallPoolFallback: false, // 小池兜底：无人过软分门槛时，放宽软分(硬条件仍守)，默认关，早期由运营开
```
- [ ] commit `feat(match-config): avoidRematch + smallPoolFallback toggles`

## Task 2：matchService —— 跨批次去重 + 小池兜底

**Files:** Modify `server/src/services/matchService.js`

- [ ] **Step 1（跨批次去重）**：在 `runBatchMatch` 候选循环里，找到硬条件校验那行之后：
```js
        if (!hardOk(settingsA, c) || !hardOk(settingsOf(c), user)) continue;
```
紧接其后加：
```js
        if (cfg.avoidRematch) {
          const [seen] = await conn.query(
            `SELECT 1 FROM user_match_log
             WHERE (user_id = ? AND match_user_id = ?) OR (user_id = ? AND match_user_id = ?)
             LIMIT 1`,
            [user.id, c.id, c.id, user.id]
          );
          if (seen.length) continue; // 这对以前配过，跳过
        }
```

- [ ] **Step 2（小池兜底）**：把打分收集 + 选最优那段改成"记录是否过门槛 + 兜底放宽"。找到当前：
```js
        const scoreAB = scorePair(user, settingsA, c, viewSim);
        const scoreBA = scorePair(c, settingsOf(c), user, viewSim);
        if (Math.min(scoreAB, scoreBA) < cfg.minSideScore) continue;

        scored.push({ candidate: c, viewSim, combined: COMBINE(scoreAB, scoreBA) });
      }

      scored.sort((a, b) => b.combined - a.combined || b.viewSim - a.viewSim);
      const best = scored[0];
      if (!best) continue;
```
替换为：
```js
        const scoreAB = scorePair(user, settingsA, c, viewSim);
        const scoreBA = scorePair(c, settingsOf(c), user, viewSim);
        scored.push({
          candidate: c,
          viewSim,
          combined: COMBINE(scoreAB, scoreBA),
          meetsFloor: Math.min(scoreAB, scoreBA) >= cfg.minSideScore,
        });
      }

      let eligible = scored.filter((s) => s.meetsFloor);
      if (eligible.length === 0 && cfg.smallPoolFallback) eligible = scored; // 兜底：放宽软分，硬条件已在上面守住
      eligible.sort((a, b) => b.combined - a.combined || b.viewSim - a.viewSim);
      const best = eligible[0];
      if (!best) continue;
```
> 硬条件(年龄等)在循环上方已 `hardOk` 守住，兜底只放宽软分门槛，不会破坏硬性择偶。

- [ ] **Step 3**：`node --check server/src/services/matchService.js`
- [ ] commit `feat(match): cross-batch dedup + small-pool soft-threshold fallback`

## Task 3：验收（node 脚本）

- [ ] 新建 `server/_rv_enh.js` 跑下面要点，跑完删：
  - 造 A(VIP男,25-35) + B(非VIP女,25-35) 互配 → 先跑一批,A↔B 配上;
  - **再跑第二批(不同 match_date)** → 断言 A 这次**不再配到 B**(avoidRematch 生效;若无其他候选则 A 0 条);
  - 造 C(VIP男,25-35) + D(女,25-35) 但把 D 的某软维度做差使 min<20:
    - `smallPoolFallback=false` → C 0 条;
    - 临时 `cfg.smallPoolFallback=true` 重跑 → C 配到 D(兜底生效);
  - 造 E(VIP男,25-35) + F(女,**18-22**) → 无论兜底开关,E **永不**配 F(硬条件年龄不破)。
  跑完清理测试数据。
- [ ] 全 PASS 后 `git rm server/_rv_enh.js && git commit -m "test(match): verify dedup + fallback + hard-filter intact"`

## GPT/自检 检查表
- [ ] 跨批次:同一对不再二次匹配(avoidRematch=true 时)
- [ ] 小池兜底:仅在 `smallPoolFallback=true` 且无人过软门槛时放宽；硬条件(年龄)始终不破
- [ ] 默认值:avoidRematch=true、smallPoolFallback=false
- [ ] 只动 matchService/matchConfig；未碰 UI/分润/cron 节奏；commit 分任务
