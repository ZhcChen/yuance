# Code Review Graph 受控使用

## 定位

Code Review Graph（CRG）为元策的 CE 工作流提供可选的代码关系图证据。它只服务于既有的 `plan` 和 `review` 阶段，不新增工作流阶段，不替代 `brainstorm -> plan -> execute -> review -> compound`，也不进入默认测试、提交或推送链。

CRG 输出是线索而不是事实裁决。证据冲突时按以下顺序处理：

1. 运行时行为、实际请求与日志
2. 测试、浏览器和设备验收结果
3. 当前源码与配置
4. CRG 高置信度关系边
5. CRG 推断关系、flow、risk 和 token savings

## 触发矩阵

| 场景 | 默认策略 | 主要查询目标 |
|------|----------|--------------|
| 跨 `api/`、`frontend/`、`web/`、`desktop/`、`docs/` 等模块改动 | 使用 | 公共契约、跨模块调用者、关联测试 |
| 公共符号、类型、接口或状态模型重构 | 使用 | callers、callees、影响半径、测试覆盖 |
| 改动文件较多或调用链无法从入口快速确认 | 使用 | 候选外文件、执行路径、风险集中点 |
| 安全、数据一致性等高影响审查 | 可使用，不能单独作为结论 | 可能遗漏的调用者与测试 |
| 单文件逻辑明确且测试边界清晰 | 通常跳过 | 必要时手工查询单个符号 |
| 小型文档、静态 CSS、局部 UI 调整 | 跳过 | 使用源码和视觉验收 |

## 操作入口

依赖 `uvx`，仓库固定使用 `code-review-graph==2.3.7`。所有命令必须由操作者显式执行：

```bash
make crg.build
make crg.update
make crg.status
make crg.review BASE=origin/main
```

在 Codex 对话中可以使用中文自然语言快捷指令，代理必须按下表执行对应的受控命令：

| 中文指令 | 实际命令 |
| --- | --- |
| `构建代码图` | `make crg.build` |
| `更新代码图` | `make crg.update` |
| `查看代码图` | `make crg.status` |
| `代码图审查` | `make crg.review`，默认基准为 `HEAD~1` |
| `代码图审查，基准 <git-ref>` | `make crg.review BASE=<git-ref>` |

中文映射只减少对话输入，不是新的 shell alias，也不允许绕过本节的手工触发、降级和禁用项。

图数据位于 `.code-review-graph/`，仅供本机使用并由 Git 忽略。首次使用或图结构明显陈旧时运行完整构建；日常查询前运行增量更新。不得运行 CRG `install`，不得启用 hooks、daemon、watch、embeddings、GitHub Action，且不得把 CRG 目标加入 `frontend-check`、`web-build`、`deploy-production`、测试、commit 或 push 默认链。

## MCP 注册

Codex MCP 使用跨项目通用名称 `code-review-graph`，固定注册命令为：

```bash
codex mcp add code-review-graph -- \
  uvx --from code-review-graph==2.3.7 code-review-graph serve
```

所有项目共用同一 MCP server 配置，但每个项目仍必须有自己的 `.code-review-graph/graph.db`；图数据按仓库隔离，不复制。CRG 从 Codex 当前工作目录自动检测仓库，配置中不得写死 `--repo`，否则通用名会退化为单项目。注册只修改用户级 Codex MCP 配置，不应生成 Codex hooks 或 Git hooks；新增 MCP 后需要重启 Codex 会话才能加载工具。

## Plan 与 Review 用法

1. 先依据目标、当前源码和 `rg` 冻结主线程首轮候选文件清单。
2. 仅在触发矩阵命中时运行 `make crg.update` 并查询符号、调用者、测试或影响范围。
3. 单独记录 CRG 新发现的候选外文件，以及这些文件经源码或测试复核后的有效性。
4. 不采纳无法由当前源码、测试或运行时证据复核的推断。
5. CRG 无结果、误报或不可用时结束旁路查询，沿原 CE 流程继续。

静态 UI 场景中，CRG 可能把模板辅助函数全部标记为测试缺口，也可能无法识别视觉流。此类输出不得代替截图、交互、响应式布局和真实设备验收。

## 故障降级

以下情况直接降级，不重试到阻塞交付：

- `uvx` 下载、MCP 启动、图构建或查询失败
- 图的 commit/更新时间与当前工作树不匹配，且无法快速增量更新
- 查询结果缺少路径、置信度低或与当前源码冲突
- CRG 查询耗时超过本次任务能够获得的预期收益

降级路径为既有 CE 流程加 `rg`、源码阅读、测试及运行时验证。计划和审查记录应简短注明降级原因，但不得把 CRG 可用性设为提交门禁。

## 验证与回滚

确认受控接入状态：

```bash
codex mcp get code-review-graph
make crg.guard
make crg.status
git check-ignore .code-review-graph/graph.db
make frontend-check -n | rg -i 'crg|code-review-graph' || true
make web-build -n | rg -i 'crg|code-review-graph' || true
make deploy-production -n | rg -i 'crg|code-review-graph' || true
```

最后三条命令应无输出。回滚 MCP 时只移除通用 server 配置，不影响各项目 `.code-review-graph/` 数据：

```bash
codex mcp remove code-review-graph
```

回滚前确认 `~/.codex/hooks.json` 未变化、Git hooks 内没有 CRG 内容，且 `make frontend-check -n`、`make web-build -n`、`make deploy-production -n` 不含 `crg` 或 `code-review-graph`。

## 试点结论（2026-08-11）

- 结论为受控保留，作为 `plan` / `review` 阶段的手工旁路证据源。
- 5 个真实跨模块试点中 3 个产生经源码复核的 CRG 独有候选文件；增量更新实测约 0.5 秒。
- `detect-changes --brief` 摘要对元策小改动召回不足，有效查询以 `query callers_of` / `importers_of` / `tests_for` 为主。
- 试点详情见 `docs/reviews/2026-08-11-code-review-graph-pilot.md`，经验见 `docs/solutions/2026-08-11-code-review-graph-cross-platform-pilot.md`。
