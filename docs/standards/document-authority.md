# 文档权威顺序

本仓库同时保留历史设计资料、活动规格、工程标准和运行手册。出现描述冲突时按以下规则判断，不因文件较长或生成自某个 Skill 就提高其权威：

## 规范权威顺序

1. 用户当前明确指令，以及本仓库根目录 `AGENTS.md`。
2. 适用的 `docs/standards/` 与具体 `docs/runbooks/`：前者定义长期工程约束，后者定义运行、迁移、发布和恢复操作。
3. 当前唯一活动需求下的 `specs/<feature>/spec.md`、`plan.md`、`tasks.md`；它们定义本需求的结果和执行方案，但不得违反以上规则。
4. `docs/reviews/`、`docs/solutions/` 提供复核证据与经验；`docs/brainstorms/`、`docs/plans/` 提供历史上下文。除非已采纳进项目标准或 Runbook，否则这些记录不构成规范，也不覆盖当前活动需求。
5. `.specify/` 上游模板、Skills、bundled workflow 和临时生成内容。

当前代码、API/数据契约、自动化测试和可复现的运行事实是判断“系统现在如何工作”的证据，不是规范授权；它们不能单独覆盖用户指令、项目标准、Runbook 或活动需求。若规则要求与现状不符，应记录差异并按规则修正，不得把现状倒推成规则。

## 事实核验顺序

说明当前行为或排查冲突时，优先核验可复现的运行行为和请求/日志，其次是测试与设备/浏览器验收，再核对当前源码、配置及 API/数据契约；历史 review、solutions 和生成内容用于补充来源。证据顺序只回答事实，不改变上面的规范权威顺序。

## 维护规则

- `spec.md` 是当前需求的用户结果和边界；`plan.md` 是实施方案；`tasks.md` 是执行状态。每个活动需求只保留一套执行入口。
- 历史 `docs/brainstorms/`、`docs/plans/` 不批量迁移；迁移到 `specs/` 时标明来源，只收录未完成工作，并在旧文档中需要时指向唯一新入口。
- `docs/reviews/` 保存有证据的审查结论，不能由 Spec Kit analyze/converge 自动替代。`docs/runbooks/` 保存可执行操作；长期约束属于 `AGENTS.md` 或 `docs/standards/`。
- `.specify/` 中带 manifest 的上游受管理文件不得手工改写。项目定制只放在根规范、`.specify/memory/constitution.md`、`.specify/templates/overrides/` 和专门 Runbook 中。
