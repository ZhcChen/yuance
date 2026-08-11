---
title: "chore: 受控引入 Code Review Graph 增强审查"
type: chore
date: 2026-08-11
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
execution_status: in_progress
---

# 受控引入 Code Review Graph 增强审查

## 目标

在保留现有 `brainstorm -> plan -> execute -> review -> compound` 主工作流的前提下，
为元策项目引入 Code Review Graph（CRG）作为 `plan` / `review` 阶段的可选旁路证据源：
跨 API、Web、Desktop 或共享前端包改动时，可以显式查询调用者、影响范围和关联测试，
但不得改变阶段顺序、自动测试、提交或推送门禁。

## 范围

- 在 `Makefile` 增加固定版本的 `crg.build`、`crg.update`、`crg.status`、`crg.review` 四个手工入口，以及独立守护目标 `crg.guard`。
- 在 `.gitignore` 增加 `.code-review-graph/`，避免图数据库进入版本控制。
- 在 `AGENTS.md` 增加 CRG 受控使用规则：触发矩阵、证据优先级、失败降级、禁止项。
- 在 `docs/prompts/plan.md`、`docs/prompts/review.md` 增加可选旁路使用提示。
- 新增 `docs/standards/tooling/code-review-graph.md` 作为项目内工具参考。
- 注册通用 Codex MCP server：`code-review-graph`，供元策及其他项目复用。
- 首次在元策仓库构建本地图数据，并抽查 Rust / JSX / Electron 调用与测试边。
- 进行 3-5 次真实 review 试点，记录有效新增、误报和降级次数后决定保留级别。

## 非目标

- 不执行 `code-review-graph install`，不安装 Codex hooks、Git hooks、daemon、watch 或 embeddings。
- 不把 CRG 加入 `frontend-check`、`web-build`、`deploy-production`、测试、commit 或 push 默认链。
- 不把 CRG 的 risk score 或 token savings 作为质量门禁。
- 不用 CRG 替代源码阅读、单元测试、E2E、浏览器或运行时验收。
- 不直接照搬 redcode-im 的“保留”结论；元策需要独立试点验证。
- 不迁移或复制 redcode-im 的图数据库；旧 `code-review-graph-redcode-im` server 可保留过渡，但通用 server 不绑定任何项目。

## 现状与需要调整

### 已存在（无需新装）

- 全局 Codex MCP 已注册 `code-review-graph-redcode-im`，命令为
  `uvx --from code-review-graph==2.3.7 code-review-graph serve`，状态 enabled。
- 本机已安装 `uvx`，可运行 CRG 2.3.7。

### 需要调整 / 新增

| 来源（redcode-im） | 元策需要调整的点 | 落地位置 |
| --- | --- | --- |
| Makefile CRG 入口 | 元策 Makefile 目前没有 CRG 目标，需新增四个手工目标与独立 `crg.guard`，并加入 `.PHONY` | `Makefile` |
| `.gitignore` | 元策未显式忽略 `.code-review-graph/`；工具自带忽略兜底，但根忽略更稳定 | `.gitignore` |
| AGENTS.md 受控规则 | 触发模块改为 `api/`、`frontend/`、`web/`、`desktop/`、`docs/` 等元策模块 | `AGENTS.md` |
| `docs/prompts/plan.md`、`review.md` | 按元策提示词简洁格式补 CRG 可选旁路说明 | `docs/prompts/` |
| 工具参考文档 | 元策没有 `docs/reference/`，按现有 `docs/standards/` 目录组织 | `docs/standards/tooling/code-review-graph.md` |
| MCP 名称与复用 | 全局已有 server 名为 `code-review-graph-redcode-im`，改为注册通用名称 `code-review-graph`，所有项目共用同一 server，图数据仍按项目隔离 | 本机 `~/.codex/config.toml` |
| 守护测试 | redcode-im 用 Go 测试，元策改为 Node/Shell 轻量守护脚本 | `scripts/assert-crg-guard.mjs` |
| 试点结论 | redcode-im 的收益基于 Rust + Vue/Dart/Kotlin/Swift；元策是 Rust + React JSX + Electron，需独立验证覆盖 | 试点记录 |

## 关键决策

1. CRG 只作为旁路证据源，证据优先级保持：运行时行为 > 测试/验收 > 当前源码 > CRG 高置信边 > CRG 推断边。
2. 固定 `code-review-graph==2.3.7`，升级必须作为独立依赖治理任务重新验证。
3. MCP 使用 `codex mcp add code-review-graph -- uvx --from code-review-graph==2.3.7 code-review-graph serve` 注册通用 server，不写项目级密钥，不启用 embeddings，也不在配置中固定 `--repo`。
4. 只允许手工执行 `make crg.build`、`make crg.update`、`make crg.status`、`make crg.review BASE=<git-ref>`。
5. 首次构建后若 JSX / Electron 覆盖不足或试点无有效新增，降级为完全手工按需调用；若出现自动触发或阻塞，移除接入。

## 阶段与执行单元

### 阶段 1：仓库规则与入口

#### U1.1 Makefile 与 .gitignore

- 修改：`Makefile`、`.gitignore`。
- 前置：无。
- 验证：
  - `make help` 显示 CRG 四个入口；
  - `make frontend-check -n`、`make web-build -n`、`make deploy-production -n` 不包含 `crg` 或 `code-review-graph`；
  - `git check-ignore .code-review-graph/graph.db` 返回被忽略。
- 完成标准：入口存在、可发现、不在自动链中，图数据不进入 Git。

#### U1.2 AGENTS.md 与提示词

- 修改：`AGENTS.md`、`docs/prompts/plan.md`、`docs/prompts/review.md`。
- 前置：U1.1。
- 验证：规则包含触发矩阵、证据优先级、中文快捷映射、失败降级和禁止项；提示词只增加旁路使用说明。
- 完成标准：代理能按规则决定何时使用、何时跳过、何时降级。

#### U1.3 工具参考文档

- 修改：新增 `docs/standards/tooling/code-review-graph.md`。
- 前置：U1.2。
- 验证：文档给出操作命令、触发矩阵、图数据位置、MCP 注册与回滚边界。
- 完成标准：文档与 Makefile 命令一致，不包含 hooks/daemon/embeddings 用法。

#### U1.4 守护验证

- 修改：新增 `scripts/assert-crg-guard.mjs`，并在 `Makefile` 增加独立 `crg.guard` 目标；不接入 `frontend-check`、`web-build` 或任何默认链。
- 前置：U1.1-U1.3。
- 验证：`make crg.guard` 断言 CRG 目标存在、`.code-review-graph/` 被忽略、`frontend-check` / `web-build` / `deploy-production` 自动链目标不含 CRG。
- 完成标准：守护测试失败能阻止规则漂移；CRG 不进入默认测试链。

### 阶段 2：本机 MCP 与图数据

#### U2.1 注册通用 MCP

- 执行：`codex mcp add code-review-graph -- uvx --from code-review-graph==2.3.7 code-review-graph serve`。
- 前置：U1.4。
- 验证：`codex mcp get code-review-graph` 返回 server；重启 Codex 会话后工具可用；在元策项目目录确认 CRG 能自动定位 `.code-review-graph/graph.db`。
- 完成标准：通用 server 不绑定项目名；CRG 启动时按当前项目根自动检测仓库，元策不依赖 redcode-im 命名 server。

通用 server 复用规则：

1. 所有项目共用同一个 MCP server 配置，命令保持 `uvx --from code-review-graph==2.3.7 code-review-graph serve`。
2. 每个项目仍必须有自己的 `.code-review-graph/graph.db`；图数据按仓库隔离，不复制。
3. CRG 从 Codex 当前工作目录自动检测仓库；配置中不得写死 `--repo`，否则通用名会退化为单项目。
4. 跨项目回滚只移除通用 server 配置，不影响各项目 `.code-review-graph/` 数据。

#### U2.2 首次构建图

- 执行：`make crg.build`。
- 前置：U2.1。
- 验证：`make crg.status` 显示文件/节点/边；记录构建耗时和 `graph.db` 大小。
- 完成标准：元策图数据可用且被 Git 忽略；构建失败不影响后续普通开发。

#### U2.3 查询能力抽测

- 执行：`make crg.review BASE=origin/main`，并手动查询一个公共符号的 callers/importers/tests。
- 前置：U2.2。
- 验证：对 Rust 符号、前端共享包符号各抽测一次，确认结果可由 `rg` 和当前源码复核。
- 完成标准：确认 CRG 对元策技术栈的覆盖边界；记录不支持或低置信场景。

### 阶段 3：试点与收口

#### U3.1 真实 review 试点

- 执行：选取 3-5 次符合触发矩阵的真实改动（跨 API/Web/Desktop 或公共契约改动）。
- 前置：U2.3。
- 验证：每次先冻结主线程首轮候选，再 `make crg.update` 查询，记录有效新增、误报和降级。
- 完成标准：达到“至少 3/5 次有效新增，且增量更新中位数不超过 5 秒”才写入保留建议；否则降级为手工。

#### U3.2 决策与文档收口

- 修改：`docs/reviews/`、`docs/solutions/`、本计划状态。
- 前置：U3.1。
- 验证：review 记录包含试点样本、有效新增、误报和降级；没有 CRG 自动触发器。
- 完成标准：明确“受控保留 / 手工按需 / 移除”三选一，并更新 `AGENTS.md` 和工具文档。

## 验证命令

```bash
make crg.status
make crg.review BASE=origin/main
make frontend-check -n | rg -i 'crg|code-review-graph' || true
make web-build -n | rg -i 'crg|code-review-graph' || true
make deploy-production -n | rg -i 'crg|code-review-graph' || true
git check-ignore .code-review-graph/graph.db
codex mcp get code-review-graph
node scripts/assert-crg-guard.mjs
git diff --check
```

## 停止条件与回滚验收

- 任一单元出现以下情况立即停止并回滚对应改动：
  - CRG 自动触发、watch、daemon 或 hooks 被引入；
  - `~/.codex/hooks.json`、Git hooks 被修改；
  - `frontend-check`、`web-build`、`deploy-production`、测试、commit 或 push 默认链出现 CRG；
  - CRG 构建、更新或查询阻塞 plan / review / commit / push 交付。
- 回滚验收：
  - `ls ~/.codex/hooks.json` 保持不存在或与接入前一致；
  - `git rev-parse --git-path hooks` 内没有 CRG 内容；
  - `make frontend-check -n`、`make web-build -n`、`make deploy-production -n` 不含 `crg` 或 `code-review-graph`；
  - `codex mcp remove code-review-graph` 只移除 server 配置，不删除任何项目的 `.code-review-graph/` 数据。

## 风险 / 待确认问题

- CRG 对 React JSX、Electron 渲染进程和 Rust/JS 跨语言契约的覆盖未知，必须先试点再决定保留级别。
- 首次构建可能产生 100MB 以上图数据库，需要确认磁盘空间和增量更新耗时。
- 全局 MCP 已存在 `code-review-graph-redcode-im`；注册通用 `code-review-graph` 后，旧 server 可保留过渡，确认无依赖后再移除，避免影响 redcode-im 当前使用。
- 通用 server 依赖 Codex 以项目根作为启动工作目录；若 U2.1 实测自动检测失败，记录原因并回退为项目级 server（显式 `--repo` 或独立名称），不阻塞普通任务。
- CRG 静态图对动态路由、宏展开、CSS 和运行时状态不可靠，不得替代浏览器或运行时验收。
- 如果试点无有效新增，应按计划降级为手工调用或移除，不硬性保留。

## 沉淀跟进

- 试点有稳定收益时，将触发矩阵、证据优先级和降级模式沉淀到 `docs/solutions/`。
- 将“静态图旁路证据 + 源码复核 + 运行时优先”的经验写入 `docs/reviews/`，供后续跨模块改动复用。

## 执行状态（2026-08-11）

- U1.1-U1.4 已实现并推送：Makefile 入口、根 `.gitignore`、AGENTS.md 规则、提示词旁路、工具文档、独立 `crg.guard`。
- U2.1 已注册通用 MCP `code-review-graph`，CLI 自动定位图数据验证通过；当前会话启动早于注册，工具加载需重启 Codex 会话后做最终验证。
- U2.2 已构建元策图数据：436 files / 6032 nodes / 83051 edges，`graph.db` 约 86M。
- U2.3 与 U3.1 已完成 5 个真实跨模块试点，结论为“受控保留”；记录见 `docs/reviews/2026-08-11-code-review-graph-pilot.md`。
- U3.2 已写入试点 review 与 solution，并更新 AGENTS.md、工具文档和本计划状态；剩余仅为本机 Codex 会话重启后的 MCP 工具加载验证。
