# agent-light-workflow 对齐复核

## 标题信息

- 主题：agent-light-workflow 轻工作流结构对齐
- 关联计划：`docs/plans/2026-07-30-001-refactor-agent-light-workflow-alignment-plan.md`
- 审查范围：`AGENTS.md`、`docs/prompts/`、`docs/reviews/`、`docs/*/TEMPLATE.md`、旧提示词入口清理与计划状态标记
- 负责人：Codex
- 日期：2026-07-30

## 目标对齐

本次 review 对照轻工作流对齐计划，确认项目已完成以下目标：

- 保留 `brainstorm -> plan -> execute -> review -> compound` 的五阶段语义。
- 使用 `docs/prompts/` 作为唯一轻工作流提示词资产。
- 补齐 `docs/reviews/` 与 `docs/brainstorms/`、`docs/plans/`、`docs/reviews/`、`docs/solutions/` 下的 `TEMPLATE.md`。
- 清理旧 `.pi` 快捷入口，避免提示词资产漂移。
- 将相关计划从执行态收敛到准确状态，减少后续判断“当前计划”的噪音。

## 已执行验证

- 命令：
  - `git status --short`
  - `find docs/plans -maxdepth 1 -type f -name '*.md' | sort`
  - `rg "^status:" docs/plans/*.md`
  - `find . -maxdepth 3 \( -name '.pi' -o -name '.pi-subagent' -o -name 'nul' -o -name 'NUL' \) -print`
  - `git ls-files | rg '(^|/)\.pi($|/)|(^|/)\.pi-subagent($|/)|(^|/)(nul|NUL)($|/)'`
- 手工检查：
  - 复核 `AGENTS.md` 的工作流入口、产物目录、执行规则、Review 和 Compound 条目。
  - 复核 `docs/prompts/README.md` 的唯一提示词资产说明与结构自检清单。
  - 复核 `docs/reviews/TEMPLATE.md` 可作为正式 review 记录结构参考。
  - 抽查仍为 `active/in_progress` 的计划，区分已完成、仅完成规划、部分完成和仍需持续推进的计划。
- 观察到的关键证据：
  - `docs/prompts/README.md`、`brainstorm.md`、`plan.md`、`execute.md`、`review.md`、`compound.md` 已存在。
  - `docs/reviews/TEMPLATE.md` 与 `docs/reviews/.gitkeep` 已存在。
  - 四类模板文件已存在：`docs/brainstorms/TEMPLATE.md`、`docs/plans/TEMPLATE.md`、`docs/reviews/TEMPLATE.md`、`docs/solutions/TEMPLATE.md`。
  - 未发现 `.pi`、`.pi-subagent`、`nul`、`NUL` 的工作区文件或 Git 跟踪文件。

## 主要发现

### 必须修正的问题

- 已完成计划仍停留在 `active` 或 `in_progress`：本轮已清理有明确完成证据的计划状态。
- 缺少本次工作流调整的正式 review 记录：本文件补齐。

### 可接受的残留项

- `docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md` 仍为 `active`：这是跨阶段长期演进计划，当前仍有 W1 以后执行内容，不应标为完成。
- `docs/plans/2026-07-25-002-feat-legacy-doc-ppt-experimental-preview-plan.md` 改为 `in_progress`：该计划已有前两个单元完成，但 Unit 3/Unit 4 仍未完成。

### 建议后续跟进

- 后续推进大计划时，优先在对应计划内记录当前阶段，避免多个 `active` 文档同时存在但无法判断主线。
- 完成阶段性工作后及时更新计划状态和执行单元勾选，减少事后考古成本。

## 与计划的一致性

- 符合计划：
  - 已以 `docs/prompts/` 作为唯一提示词资产。
  - 已补齐 review 目录与模板结构。
  - 已清理旧 `.pi` 入口。
  - 已将 `AGENTS.md` 与 `docs/prompts/` 定义为工作流规则规范源。
- 偏离计划：
  - 无业务范围偏离；本次只做文档和状态收敛。

## 回归与风险

- 是否发现明显回归：未发现。
- 仍需关注的风险：
  - 旧计划若后续实现与当前代码事实继续漂移，需要在执行前重新复核。
  - `active` 状态应尽量只保留给当前确实会继续推进的计划。

## 结论

- 结论：通过
- 下一步：进入沉淀或继续推进当前业务计划
