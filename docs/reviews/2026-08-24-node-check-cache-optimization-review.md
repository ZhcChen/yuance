# Node 检查链缓存与并行化复核

## 标题信息

- 主题：web / frontend / desktop 检查链构建速度优化
- 关联计划：无独立 plan，作为本地构建速度优化的执行单元
- 审查范围：`web/package.json`、`frontend/package.json`、`frontend/packages/*/package.json`、`desktop/package.json`、`desktop/scripts/check-sources.mjs`、`desktop/scripts/check-main.manifest`
- 负责人：Codex
- 日期：2026-08-24

## 目标对齐

在 Rust 构建已实测较快（API debug 34s、release 71s）的前提下，降低前端与桌面重复检查链耗时：

- `tsc` 增加增量缓存；
- `eslint` 增加缓存；
- desktop 多文件 `node --check` 改为并行执行。

## 已执行验证

- `npm --prefix web run check:js`：全量基线 3.50s，启用增量后第二次 0.65s。
- `npm --prefix web run lint`：首次 0.94s，第二次 0.31s。
- `npm --prefix frontend run check:js --workspaces --if-present`：首次 5.54s，第二次 2.14s。
- `npm --prefix desktop run check:main`：串行基线 1.95s，并行后 0.40s。
- `npm --prefix desktop run check`：完整链路通过，10.92s（含首次 file-guard Rust 测试编译）。
- 错误路径：`node ./scripts/check-sources.mjs src/definitely-not-exists.mjs` 输出错误并以退出码 1 结束。
- 缓存文件确认位于 `node_modules/.cache/`，已被 `node_modules/` 忽略规则覆盖。

## 主要发现

### 必须修正的问题

- 无。

### 可接受的残留项

- `frontend` 的 `check:packages` 仍由 npm 串行执行 5 个 package，剩余耗时主要是 npm 启动开销，未引入新依赖并行化。
- eslint 缓存文件在多 package 间共享，ESLint 缓存键包含配置与文件路径，行为正确。
- `tsbuildinfo` / eslint 缓存位于 `node_modules/.cache`，`npm ci` 后会被清空，首次检查会重新全量执行，属预期行为。

### 建议后续跟进

- 若后续 `desktop check` 仍是高频瓶颈，可评估将各组 check 合并为一次并行调用，以及给 Vite 构建加入缓存策略。

## 与计划的一致性

- 全部改动都在既定优化范围内，未引入新依赖、未改变检查语义。

## 回归与风险

- 是否发现明显回归：未发现。
- 仍需关注的风险：`desktop/scripts/check-main.manifest` 新增文件后需随新增源码同步维护；脚本对单个文件仍使用 `node --check`，错误退出码语义与原串行命令一致。

## 结论

- 结论：通过
- 下一步：进入沉淀
