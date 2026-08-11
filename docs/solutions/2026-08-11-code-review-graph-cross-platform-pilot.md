# Code Review Graph 跨平台改动试点沉淀

## 适用场景

CRG 已按受控方式保留为 `plan` / `review` 阶段的手工旁路证据源。跨 API / Web / Desktop / 共享前端包的改动，以及公共契约重构，适合使用。

## 有效做法

- 先用 `git show --name-only` 冻结主线程首轮候选文件，再运行 `make crg.update` 和手工 `query`，避免图结果反客为主。
- 对平台适配器、共享 UI 组件和 API client 符号优先查询 `callers_of`、`importers_of`、`tests_for`；元策试点里有效新增集中在 `web/src/main.jsx`、`desktop/src/main.mjs`、`desktop/test/support/network-session-electron-driver.mjs` 这类入口或支撑文件。
- `detect-changes --brief` 的摘要面板对元策小改动召回不足，不能作为“无影响”的结论；应继续用手工 `query` 并复核。
- 需要复核历史提交时，可用临时 `git worktree` 检出提交，并把当前仓库 `.code-review-graph` 以符号链接接入 worktree；CRG 查询只读，不改图数据，完成后删除 worktree。

## 边界

- 不得运行 CRG `install`，不得启用 hooks、daemon、watch、embeddings，也不得把 CRG 加入默认测试、commit 或 push 链。
- CRG 静态图不替代浏览器、Electron 或运行时验收；证据冲突时仍按“运行时 > 测试/验收 > 当前源码 > CRG”处理。
