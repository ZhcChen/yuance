# Spec Kit 开发工作流

## 适用范围

本仓库默认使用 Spec Kit Skills 编排中型及以上工作。Spec Kit 不替代代码审查、测试、数据迁移门禁、部署授权或 Git 规则。

当前固定上游资产为 Specify CLI `1.1.2`，集成 Codex。官方 `v1.1.2` 于 2026-10-07 发布；上游 CLI 仅用于版本与集成资产检查，日常工作流不要求安装全局命令。仓库内脚本和模板已提交，Codex 会话从 `.agents/skills/` 加载项目 Skills。

不得在当前仓库运行 `specify init --here --force`、`specify integration use` 或其他会刷新/覆盖项目资产的管理操作。CLI 只在临时目录生成升级候选；升级必须作为独立改动核对上游发布、manifest、模板、脚本执行位和回归结果。

只读检查命令：

```bash
uv tool run --from specify-cli==1.1.2 specify version
uv tool run --from specify-cli==1.1.2 specify integration status --json
```

## 入口与流程

| 阶段 | Codex Skill / 仓库入口 | 产物或用途 |
| --- | --- | --- |
| 需求目录和草稿 | `make spec-kit-init FEATURE=specs/<feature>` | 从项目 spec 覆盖模板排他创建 `spec.md`；不创建分支、不写活跃指针 |
| 规格编写 | `$speckit-specify`，限定显式目录 | 填写 `spec.md`；不得改写 `.specify/feature.json` 或覆盖已有用户内容 |
| 澄清（按需） | `make spec-kit-check FEATURE=... STAGE=clarify` 后 `$speckit-clarify` | 解决会影响范围、安全或用户体验的真实歧义 |
| 方案 | `make spec-kit-check FEATURE=... STAGE=plan` 后 `$speckit-plan` | `plan.md`；研究、数据模型、合同、quickstart 按需生成 |
| 任务 | `make spec-kit-check FEATURE=... STAGE=tasks` 后 `$speckit-tasks` | `tasks.md`：文件范围、依赖、验证和状态 |
| 一致性 | `make spec-kit-check FEATURE=... STAGE=analyze` 后 `$speckit-analyze` | 只读检查 spec/plan/tasks 冲突与遗漏 |
| 实施 | `make spec-kit-check FEATURE=... STAGE=implement` 后 `$speckit-implement` | 按任务实施并记录真实验证证据 |
| 收敛 | `make spec-kit-check FEATURE=... STAGE=converge` 后 `$speckit-converge` | 检查遗漏；必要时只增补任务，不代替修复、review 或测试 |

仅当需求已有实质歧义时执行 clarify。明确的小修改直接定位、修改和聚焦验证；Bug 先复现再定位和修复，范围扩大时再建规格。不要为每次变更机械生成完整文档、三条故事或全套辅助产物。

Checklist 按需使用。它是需求质量辅助，不是实现验收；implement 不得自行勾选 reviewer 维护的 checklist。Spec Kit analyze、checklist、converge 和任务勾选均不替代独立代码审查、真实测试、运行时验收或部署授权。

## 项目入口与需求目录

所有命令显式指定 `FEATURE=specs/<feature>`，名称使用小写字母、数字和连字符。`FEATURE` 与 Git 分支独立，不从当前分支推导，不自动创建或切换分支。通过仓库入口：

```bash
make spec-kit-init FEATURE=specs/001-resource-export
make spec-kit-check FEATURE=specs/001-resource-export STAGE=clarify
make spec-kit-check FEATURE=specs/001-resource-export STAGE=plan
make spec-kit-check FEATURE=specs/001-resource-export STAGE=tasks
make spec-kit-check FEATURE=specs/001-resource-export STAGE=analyze
make spec-kit-check FEATURE=specs/001-resource-export STAGE=implement
make spec-kit-check FEATURE=specs/001-resource-export STAGE=converge
make spec-kit-verify
```

项目入口要求 Bash、Node.js（项目现有开发工具链）。不会启动业务服务，也不依赖 `uv` 或联网；`uv tool run` 只用于管理和诊断上游资产。

- init 仅在目标不存在时创建；已存在的 spec 返回需要先读取的文件，不复制模板覆盖。已有 plan/tasks 但缺少 spec 时拒绝初始化，先核对来源。
- check 只检查阶段必需文件、明显模板残留、未解决的澄清、FR/T 编号、plan 验证章节和验证任务，并将显式路径传给上游只读前置检查。
- check 不写或读取 `.specify/feature.json`，不会切换分支。调用上游脚本时必须显式设置 `SPECIFY_INIT_DIR`、`SPECIFY_FEATURE_DIRECTORY` 和 `SPECIFY_FEATURE_NO_PERSIST=1`；不得依赖持久化的活跃指针。
- 目录名必须符合入口格式，目录及 `spec.md`、`plan.md`、`tasks.md` 必须是仓库内普通目录/文件，不接受符号链接。
- 验证器只负责有限结构检查，不判断所有自然语言歧义、不证明命令有效或测试已运行；通过后仍必须读取检查输出中的必需产物并执行真实验证。

`make spec-kit-check` 只给该次 Node 进程传递参数，不会为随后执行的 Skill 或其他 shell 命令设置环境。上游 Skills 中写出的裸脚本命令必须按下表覆盖；每次调用都以活动需求的同一个 `FEATURE` 传递环境变量，并确认输出 `FEATURE_DIR` 与该目录一致后再继续：

| Skill 阶段 | 上游脚本与参数 | 项目覆盖 |
| --- | --- | --- |
| `specify` | Skill 内自动创建目录、写 `.specify/feature.json`、强制生成 checklist | 先运行 `make spec-kit-init FEATURE=...`；Skill 只续写显式目录下的 `spec.md`，不建目录、不写指针，checklist 按需 |
| `clarify` | `check-prerequisites.sh --json --paths-only` | 加下方环境前缀；只处理当前 `FEATURE` |
| `plan` | `setup-plan.sh --json` | 加下方环境前缀；只生成或更新 `plan.md`，research、data-model、contracts、quickstart 按需 |
| `tasks` | `setup-tasks.sh --json` | 加下方环境前缀；只生成或增量更新 `tasks.md`，不重置稳定 ID、状态和备注 |
| `analyze` | `check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` | 加下方环境前缀，只读检查当前 `FEATURE` |
| `implement` | `check-prerequisites.sh --json --require-tasks --include-tasks` | 加下方环境前缀，只读检查当前 `FEATURE` |
| `converge` | `check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` | 加下方环境前缀，只读检查当前 `FEATURE` |

具体调用格式如下，`<feature>` 必须替换为本次已经确定的需求目录：

```bash
SPECIFY_INIT_DIR="$PWD" SPECIFY_FEATURE_DIRECTORY=specs/001-resource-export SPECIFY_FEATURE_NO_PERSIST=1 \
  bash .specify/scripts/bash/setup-plan.sh --json
```

示例中的脚本和参数按阶段表替换，需求路径替换为当前活动 `FEATURE`。

显式环境变量优先于可能残留的 `.specify/feature.json`，`SPECIFY_FEATURE_NO_PERSIST=1` 阻止上游脚本写回指针。不得运行会按当前分支自动选目录的 `create-new-feature.sh`，不得自动执行 `.specify/extensions.yml` 中的 hooks；如发现扩展配置，先报告并等待用户明确授权。各 agent/并行任务都传入本次同一 FEATURE；并行写入还必须使用隔离 worktree 且文件无交集。

## 产物维护与旧任务续接

- 只维护一个活动需求目录。新需求优先复用相关规格与现有测试，不开平行计划。
- 已有 tasks 必须先读再增量维护，保留稳定 ID、完成状态、人工备注和验证证据；新 ID 从最大编号递增。不再适用的未完成任务应说明原因，不得重置为全新模板。
- 历史 `docs/brainstorms/`、`docs/plans/` 不批量迁移。旧任务可按原计划继续；需要切换到 Spec Kit 时先核对当前代码、测试和提交，spec 引用旧计划，只把尚未完成的工作写入 tasks，并在旧文档注明新唯一入口。
- `docs/reviews/` 仍用于记录重要或被要求保留的复核；`docs/solutions/` 仍用于沉淀可复用经验。它们不是 Spec Kit 阶段的替代品。

## 审查、验证与交付

- 每个完成的小闭环先按风险执行聚焦测试、构建或静态检查；跨模块、公共契约、安全或数据一致性变更应扩大验证范围并安排独立复核。
- 报告实际通过、失败、跳过与未验证事项。analyze 和 converge 不能证明实现通过。
- 运行、迁移、排障、发布和恢复按对应 Runbook 执行。不得因 plan/tasks 有部署步骤就视为已获授权；正式环境部署仍按 `docs/runbooks/production-deployment.md` 与 `AGENTS.md` 执行。
- Git 操作服从 `AGENTS.md` 与现有分支约束：只暂存本轮文件，审查 staged diff 后按小闭环提交并推送当前协作分支。不得自动建分支、PR、外部工单或 GitHub workflow。

## 上游 workflow、Skills 与扩展边界

- `.specify/workflows/speckit/workflow.yml` 是上游通用资产，保留用于兼容与审阅；本仓库通过本 Runbook 和项目入口逐步执行，不直接运行 `specify workflow run speckit`，因为它不代表本项目的全部前置检查和授权规则。
- `.agents/skills/speckit-taskstoissues/` 是未修改的上游资产；本仓库不接入 GitHub issue/PR 自动化，不调用该 Skill。
- 不安装扩展或 hooks 来自动创建/切换分支、改写规格、调用其他模型、提交代码、创建外部工单或部署。用户指令、`AGENTS.md` 与 Runbook 始终优先。
- `.agents/skills/` 与 `.specify/integrations/` 内由 manifest 管理的上游文件保持原样。项目约束只维护在 `AGENTS.md`、本宪章、模板 overrides 和 Runbook。

## 会话与验收边界

新增 Skill 后重新启动 Codex 会话以刷新项目 Skill 清单。若新会话未发现 Skill，可直接读取对应 `SKILL.md`，但须说明尚未验证原生入口加载。

结构检查与安装状态通过不代表新工作流已在真实需求中完成业务闭环。后续首次真实使用需分别确认 Skill 加载、显式目录行为、任务续写、代码验证和交付边界；不得为了工作流验收改动业务或部署。
