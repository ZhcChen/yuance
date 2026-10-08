# 活动规格

新建或续接中型及以上工作时，在 `specs/<feature>/` 中维护唯一活动规格：

- `spec.md`：目标、范围、用户场景、功能要求和验收标准。
- `plan.md`：基于当前源码的实施方案、影响文件、依赖、风险和验证。
- `tasks.md`：可执行任务、依赖、进度和验收证据。

需求目录必须显式指定，并通过仓库根目录的 `make spec-kit-init` / `make spec-kit-check` 入口创建和检查。完整规则见 `docs/runbooks/spec-kit-workflow.md`。

既有 `docs/brainstorms/`、`docs/plans/`、`docs/reviews/`、`docs/solutions/` 均保留为历史记录或独立审查/经验文档；不要批量重命名或复制成新的活动需求。
