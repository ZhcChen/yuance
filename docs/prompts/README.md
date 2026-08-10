# 提示词参考说明

这里的 `*.md` 文件不是 Codex 的内建命令，而是可直接复制、改写、粘贴给 Codex 的参考提示词资产。

本项目以 `docs/prompts/` 作为唯一的轻工作流提示词资产。旧快捷入口已清理，避免同一阶段提示词出现多份副本后发生漂移。

工作流语义：`brainstorm -> plan -> execute -> review -> compound`。

## 同步规则

- 工作流规则的规范源是 `AGENTS.md` 与 `docs/prompts/`。
- 修改阶段提示词时，只更新 `docs/prompts/*.md` 和必要的 `AGENTS.md` 入口说明，不另建平行提示词目录。

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

`docs/*/TEMPLATE.md` 只作结构参考，正式内容应写入同目录下的具体命名文件。
