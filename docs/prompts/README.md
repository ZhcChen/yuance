# 提示词参考说明

这里的 `*.md` 文件不是 Codex 的内建命令，而是可直接复制、改写、粘贴给 Codex 的参考提示词资产。

本项目同时保留 `.pi/prompts/`：

- `docs/prompts/`：面向 Codex 原生协作，便于复制和改写。
- `.pi/prompts/`：面向本项目 Pi 工作流入口，提供 `/brainstorm`、`/plan`、`/execute`、`/review`、`/compound` 快捷调用。

两者共享同一工作流语义：`brainstorm -> plan -> execute -> review -> compound`。

## 同步规则

- 工作流规则的规范源是 `AGENTS.md` 与 `docs/prompts/`。
- `.pi/prompts/` 是快捷入口，应跟随规范源同步，而不是另行定义一套流程。
- 修改任一阶段提示词时，应同时检查同名的 `docs/prompts/*.md` 与 `.pi/prompts/*.md`，确保阶段目标、产物目录、停止条件和验证口径一致。

## 使用建议

- 先根据当前任务挑一个最接近的阶段提示词。
- 把占位信息替换成这次任务的真实上下文。
- 涉及计划、文档、文件路径时，优先填写仓库相对路径。
- 如果任务很小，不必机械套提示词，直接做事即可。

常见对应关系：

- 需求不清、方案分叉：`brainstorm.md`
- 要形成正式计划：`plan.md`
- 已有计划准备执行：`execute.md`
- 改动完成准备复核：`review.md`
- 有经验要沉淀：`compound.md`

## 结构自检

若需要确认本项目仍符合轻工作流结构，检查以下资产是否存在：

- `AGENTS.md`
- `docs/brainstorms/TEMPLATE.md`
- `docs/plans/TEMPLATE.md`
- `docs/reviews/TEMPLATE.md`
- `docs/solutions/TEMPLATE.md`
- `docs/prompts/README.md`
- `docs/prompts/brainstorm.md`
- `docs/prompts/plan.md`
- `docs/prompts/execute.md`
- `docs/prompts/review.md`
- `docs/prompts/compound.md`
- `.pi/prompts/brainstorm.md`
- `.pi/prompts/plan.md`
- `.pi/prompts/execute.md`
- `.pi/prompts/review.md`
- `.pi/prompts/compound.md`

`docs/*/TEMPLATE.md` 只作结构参考，正式内容应写入同目录下的具体命名文件。
