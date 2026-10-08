# Spec Kit 工作流迁移计划

> 历史记录：本文描述 2026-10-08 迁移验收时的项目状态；本项目的 CRG 集成已在后续改动中移除。

> 状态：已完成
>
> 日期：2026-10-08
>
> 上游参考：本机 `qfy-voucher-hub` 仓库中的 Spec Kit 迁移计划、Runbook 与加固实现

## 目标

将本仓库默认 AI 工作流从 CE 轻工作流切换为 Spec Kit。新中大型需求使用 `specs/<feature>/spec.md`、`plan.md`、`tasks.md`，并继续执行独立代码审查、聚焦验证、提交与推送规则。

## 范围

- 导入由 Specify CLI `1.1.2` 生成的 Codex 项目集成和 Spec Kit 共享资产，并保留其上游 manifest 与受管理文件内容。
- 建立本项目的 constitution、工作流 Runbook、模板覆盖和明确需求目录的项目入口。
- 更新根 `AGENTS.md`、README、文档权威规则、CRG 说明和旧提示词入口，消除活动规范中的 CE 默认流程。
- 增加覆盖保护、阶段前置检查和工作流回归测试。

## 非目标

- 不修改业务代码、数据库 migration、API、生产配置或正式环境。
- 不批量转换或重命名 `docs/brainstorms/`、`docs/plans/`、`docs/reviews/`、`docs/solutions/` 中的历史文档及其引用。
- 不卸载全局 CE 插件，不改用户级 Codex 设置，不引入 MiniMax 或 GitHub workflow。
- 不把 Spec Kit 的 analyze、checklist 或 converge 当成代码审查、测试或部署授权。

## 执行单元

### U1：导入官方 Spec Kit Codex 资产

- 文件：`.agents/skills/`、`.specify/`、`specs/README.md`。
- 使用 Specify CLI `1.1.2` 生成临时 Codex scaffold；只把本项目需要的 Codex 集成与共享资产纳入仓库，不在当前工作树运行可能覆盖文件的 `specify init --here --force`。
- [x] 完成标准：CLI 版本可复核；官方受管理文件与 manifest 完全匹配；仅包含 Codex 集成。

### U2：建立项目规范与工作流入口

- 文件：`AGENTS.md`、`README.md`、`docs/standards/document-authority.md`、`docs/standards/tooling/code-review-graph.md`、`docs/runbooks/spec-kit-workflow.md`、`.specify/memory/constitution.md`、`docs/prompts/`。
- 明确 spec / plan / tasks 的边界、适用范围、历史任务续接、review/验证/提交、部署与并发约束；旧 CE 提示词退出现行入口。
- [x] 完成标准：新会话能从仓库规范定位唯一工作流；现有 Git、部署、CRG 与领域安全约束仍有效。

### U3：建立项目防护入口与模板覆盖

- 文件：`.specify/templates/overrides/`、`scripts/ops/spec-kit.cjs`、`scripts/test/spec-kit.test.cjs`、`Makefile`。
- 提供显式 `specs/<feature>` 的初始化和阶段检查；排他创建草稿、保护已有产物、拒绝越界路径和符号链接，并对阶段必需产物做有限结构检查。
- [x] 完成标准：小修改无需完整规格；初始化与检查不依赖或改写共享活跃指针；模板要求匹配风险的验证任务。

### U4：复核与交付

- 对照本计划检查文件范围和旧文档链接；执行 Spec Kit 资产、脚本语法、工作流回归及 diff 检查。
- [x] 完成标准：负例失败关闭，正例定位正确；无业务构建或部署；复核结论记录在 `docs/reviews/`。

## 风险与约束

- 官方 Spec Kit 资产会随 CLI 版本变化；上游文件保持原样，项目约束集中在 AGENTS、constitution、overrides 和 Runbook。升级必须独立核验版本和 manifest。
- Spec Kit 静态检查不能证明需求无歧义、测试真实运行或实施合规；实现者和 reviewer 仍须阅读产物并验证代码。
- 历史路径被大量引用，迁移只改变新任务入口，不改旧文档路径或状态。

## 验证

- [x] `uv tool run --from specify-cli==1.1.2 specify version`：版本为 `1.1.2`。
- [x] `uv tool run --from specify-cli==1.1.2 specify integration status --json`：状态为 `ok`，仅安装 Codex，无缺失或漂移。
- [x] `make spec-kit-verify`：10 项通过，覆盖初始化、阶段输入、模板残留、重复任务 ID、越界路径、目录/产物/上游资产符号链接及旧活跃指针行为。
- [x] `node --check scripts/ops/spec-kit.cjs` 与 `node --check scripts/test/spec-kit.test.cjs`。
- [x] `git diff --check`。
- [x] `make crg.update` 与 `make crg.review BASE=HEAD`：52 个 staged 文件，0 个变更函数、受影响 flow 或测试缺口，风险分 0。
- [x] 独立复核记录：`docs/reviews/2026-10-08-001-refactor-spec-kit-workflow-review.md`。

未执行业务构建、正式环境部署或生产数据操作；这些不属于本次工作流迁移的验收范围。Codex 原生 Skill 的实际加载与首次业务闭环留给后续真实需求确认。

## 沉淀

本次工作流的长期操作约束记录在 Runbook 与 constitution；若出现可复用的迁移经验，再补充 `docs/solutions/`。
