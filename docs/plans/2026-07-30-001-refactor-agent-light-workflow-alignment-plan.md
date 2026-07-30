---
title: refactor: 对齐 agent-light-workflow 轻工作流结构
type: refactor
status: completed
date: 2026-07-30
---

# refactor: 对齐 agent-light-workflow 轻工作流结构

## Overview

本计划用于把当前项目的 CE / Pi 适配版工作流调整为兼容 `agent-light-workflow` Codex 版轻工作流的结构，同时保留项目已有 `.pi/prompts/` 入口和当前文档资产。

推荐路线是“兼容增强”，不是直接覆盖：新增 `docs/prompts/`、`docs/reviews/` 和各类 `TEMPLATE.md`，并轻量修订 `AGENTS.md` 说明二者关系。这样既满足 `agent-light-workflow` 的目录与提示词约定，也不破坏当前项目已经形成的 CE 执行习惯。

## Problem Frame

当前项目已经遵循 `brainstorm -> plan -> execute -> review -> compound` 的核心流程，但与 `agent-light-workflow` 原版存在结构偏差：

- 原版把提示词放在 `docs/prompts/*.md`，并明确它们只是可复制参考资产。
- 当前项目把提示词放在 `.pi/prompts/*.md`，并作为 Pi 入口使用。
- 原版包含 `docs/reviews/` 与四类 `TEMPLATE.md`。
- 当前项目没有 `docs/reviews/`，也没有 `docs/brainstorms/TEMPLATE.md`、`docs/plans/TEMPLATE.md`、`docs/reviews/TEMPLATE.md`、`docs/solutions/TEMPLATE.md`。
- 当前 `AGENTS.md` 明确采用 CE 作为主工作流，和原版“不引入隐藏 runtime / Pi 专用目录”的定位不同。

因此，调整目标不是改业务代码，而是让仓库同时满足：

1. Codex 直接读取 `AGENTS.md` 后能理解并执行轻工作流。
2. `agent-light-workflow` 的预期目录和模板资产存在。
3. `.pi/prompts/` 仍可作为本项目快捷入口，不强迫历史文档和团队习惯迁移。

## Requirements Trace

- R1. 保留现有五阶段流程语义：`brainstorm -> plan -> execute -> review -> compound`。
- R2. 新增 `docs/prompts/*.md`，作为 Codex 可复制 / 改写的参考提示词资产。
- R3. 新增 `docs/reviews/`，用于重要改动的复核与验证记录。
- R4. 新增 `docs/*/TEMPLATE.md`，并继续禁止把正式内容直接写进模板。
- R5. 更新 `AGENTS.md`，明确 `docs/prompts/` 与 `.pi/prompts/` 的关系，避免把项目误读为只支持 Pi。
- R6. 不迁移、不重命名现有 `docs/brainstorms/`、`docs/plans/`、`docs/solutions/` 正式文档。
- R7. 不影响业务代码、部署脚本、API 契约或测试流程。

## Scope Boundaries

- 不删除 `.pi/prompts/`。
- 不批量重写历史计划、需求和沉淀文档。
- 不引入新的脚本、后台 runtime、任务调度器或工作流 CLI。
- 不替换项目当前 Git 提交与推送规范。
- 不把 `agent-light-workflow` 初始化脚本直接跑在本仓库上，避免覆盖现有 `AGENTS.md`。

## Context & Research

### Relevant Code and Patterns

- `AGENTS.md`：当前项目级工作流约束入口。
- `.pi/prompts/brainstorm.md`、`.pi/prompts/plan.md`、`.pi/prompts/execute.md`、`.pi/prompts/review.md`、`.pi/prompts/compound.md`：当前 Pi 入口提示词。
- `docs/brainstorms/`：已有需求澄清文档。
- `docs/plans/`：已有正式执行计划。
- `docs/solutions/`：已有经验沉淀文档。
- `docs/standards/git-workflow.md`：当前 Git 工作方式约束，调整不应冲突。

### Institutional Learnings

- `docs/solutions/` 当前没有与工作流调整直接相关的沉淀。
- `docs/solutions/patterns/critical-patterns.md` 当前不存在。
- 现有沉淀文档显示项目倾向记录“关键结论、适用范围、验证证据”，后续 `docs/solutions/TEMPLATE.md` 应覆盖这些字段。

### External References

- `agent-light-workflow` README（`549e27a`）：原版定位是纯文档工作流 + 薄初始化脚本，不提供 Pi / harness 专用目录。
- `agent-light-workflow/templates/project/AGENTS.md`（`549e27a`）：原版 `AGENTS.md` 结构包含工作流、产物目录、语言与路径、执行规则、Review、Compound、工作方式。
- `agent-light-workflow/init.sh`（`549e27a`）：原版会创建 `docs/brainstorms`、`docs/plans`、`docs/reviews`、`docs/solutions`、`docs/prompts` 并写入模板。

## Key Technical Decisions

- **采用兼容增强，而不是替换当前 CE/Pi 入口。** 当前项目已有大量 `.pi/prompts/` 和 CE 文档资产，直接替换会破坏既有协作习惯；新增 `docs/prompts/` 可满足 Codex 版轻工作流结构。
- **把 `docs/prompts/` 定义为参考提示词，把 `.pi/prompts/` 定义为快捷入口。** 这样和 `agent-light-workflow` 的“提示词资产而非隐藏 runtime”定位兼容，同时保留 Pi 入口。
- **新增 `docs/reviews/` 但不强制所有 review 都落文档。** 原版要求重要改动可保留复核记录；本项目也应保持轻量，只在高风险、跨模块或需要留证时写正式 review。
- **新增模板，不重写历史文档。** 历史文档已经有项目风格，批量改写收益低、风险高；模板只约束新增文档。
- **把差异写进 `AGENTS.md` 而不是另建复杂规范。** 工作流入口信息应集中在根目录 `AGENTS.md`，避免 agent 首次进入项目时漏读。

## Open Questions

### Resolved During Planning

- 是否保留 `.pi/prompts/`：保留，作为项目适配入口。
- 是否新增 `docs/prompts/`：新增，作为 Codex 原版兼容资产。
- 是否新增 `docs/reviews/`：新增，但只对重要 review 落文档。
- 是否批量迁移历史文档：不迁移。

### Deferred to Implementation

- `docs/prompts/*.md` 是否完全照搬外部模板文案，还是吸收本项目已有 `.pi/prompts/` 细节后本地化：执行时按 diff 可读性决定，但必须保留原版“可复制参考提示词”的定位。
- `AGENTS.md` 是最小补充还是重排章节：执行时以最小可读 diff 为准，避免无关重写。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
agent-light-workflow 原版兼容层
  docs/prompts/*.md        # Codex 可复制参考提示词
  docs/*/TEMPLATE.md       # 新文档结构参考
  docs/reviews/            # 重要复核记录

项目现有适配层
  .pi/prompts/*.md         # Pi 快捷入口，继续保留
  .context/                # 运行期中间产物，继续不入版本控制

统一入口
  AGENTS.md                # 说明主流程、产物目录、两套提示词关系和执行规则
```

## Implementation Units

- [x] **Unit 1: 补齐 Codex 参考提示词目录**

**Goal:** 新增 `docs/prompts/`，让项目具备 `agent-light-workflow` 原版预期的 Codex 可复制提示词资产。

**Requirements:** R1, R2, R5

**Dependencies:** 无

**Files:**
- Create: `docs/prompts/README.md`
- Create: `docs/prompts/brainstorm.md`
- Create: `docs/prompts/plan.md`
- Create: `docs/prompts/execute.md`
- Create: `docs/prompts/review.md`
- Create: `docs/prompts/compound.md`

**Approach:**
- 以外部模板的 `docs/prompts/*.md` 为基础，补入本项目的简体中文、仓库相对路径、复用现有文档、不要改 `TEMPLATE.md` 等规则。
- 明确这些文件是“参考提示词资产”，不是 Codex 内建命令。
- 在 `README.md` 中说明 `.pi/prompts/` 是项目快捷入口；如果使用 Codex 原生协作，可直接复制 `docs/prompts/*.md` 内容。

**Patterns to follow:**
- `.pi/prompts/*.md` 的阶段描述和项目约束。
- `agent-light-workflow` 原版 `docs/prompts/*.md` 的可复制提示词形态。

**Test scenarios:**
- Test expectation: none -- 文档资产补齐，无运行时行为变化。

**Verification:**
- `docs/prompts/` 下 6 个文件存在。
- 每个提示词都声明适用阶段、输入占位、输出位置和不直接修改模板的约束。
- 文档内路径全部使用仓库相对路径。

- [x] **Unit 2: 补齐模板与 review 目录**

**Goal:** 新增原版预期的模板文件和 `docs/reviews/`，补齐轻工作流产物结构。

**Requirements:** R3, R4, R6

**Dependencies:** 无

**Files:**
- Create: `docs/brainstorms/TEMPLATE.md`
- Create: `docs/plans/TEMPLATE.md`
- Create: `docs/reviews/TEMPLATE.md`
- Create: `docs/reviews/.gitkeep`
- Create: `docs/solutions/TEMPLATE.md`

**Approach:**
- 参考 `agent-light-workflow` 原版模板，并结合项目现有正式文档风格。
- 模板强调只作结构参考，正式内容写入具体命名文件。
- `docs/reviews/TEMPLATE.md` 覆盖目标对齐、验证证据、主要发现、与计划一致性、回归风险和结论。
- 不改已有正式文档，避免批量格式漂移。

**Patterns to follow:**
- `docs/plans/2026-07-13-002-feat-project-resource-library-plan.md` 的需求追踪、范围边界、实现单元、验证描述。
- `docs/solutions/2026-07-29-remove-resource-version-snapshots.md` 的背景、决策、验证、相关文件结构。

**Test scenarios:**
- Test expectation: none -- 文档模板补齐，无运行时行为变化。

**Verification:**
- 四个 `TEMPLATE.md` 文件存在。
- `docs/reviews/` 存在且可被 Git 跟踪。
- 模板不包含正式任务内容或误导性历史结论。

- [x] **Unit 3: 修订 AGENTS.md 的工作流说明**

**Goal:** 让根入口文档明确本项目兼容 `agent-light-workflow`，并解释 `docs/prompts/` 与 `.pi/prompts/` 的边界。

**Requirements:** R1, R2, R3, R5

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- 在“工作模式”中把当前项目定义为“基于 agent-light-workflow 的 CE/Pi 适配版”或等价表述。
- 在“产物约定”中补充：
  - `docs/reviews/`：重要改动复核与验证记录。
  - `docs/prompts/`：Codex 可复制参考提示词。
  - `.pi/prompts/`：项目快捷入口。
- 保留当前 Git、部署、Context7、chrome-devtools 等项目特有规则。
- 避免把 `docs/prompts/` 描述成隐藏命令或必须自动执行的 runtime。

**Patterns to follow:**
- 当前 `AGENTS.md` 的简体中文、短条目、明确优先级风格。
- `agent-light-workflow/templates/project/AGENTS.md` 的产物目录和轻工作流定位。

**Test scenarios:**
- Test expectation: none -- 约束文档调整，无运行时行为变化。

**Verification:**
- `AGENTS.md` 同时提到 `docs/prompts/` 和 `.pi/prompts/`，且二者职责不冲突。
- `AGENTS.md` 不再让读者误以为本项目缺少 Codex 原版提示词资产。
- 原有项目部署、Git、工具使用规则仍保留。

- [x] **Unit 4: 增加结构一致性检查说明**

**Goal:** 提供轻量检查口径，后续可快速判断工作流结构是否继续符合预期。

**Requirements:** R1-R7

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `docs/prompts/README.md`
- Modify: `AGENTS.md`

**Approach:**
- 在 `docs/prompts/README.md` 中补一个“结构自检”清单，覆盖目录、模板和提示词文件。
- 在 `AGENTS.md` 中只保留简短入口，不堆长命令。
- 不新增 shell 脚本，符合轻工作流“不引入隐藏脚本层”的取舍。

**Patterns to follow:**
- `agent-light-workflow` README 的轻量说明风格。
- `docs/standards/git-workflow.md` 的明确检查口径，但不要复制其 Git 命令细节。

**Test scenarios:**
- Test expectation: none -- 文档检查说明，无运行时行为变化。

**Verification:**
- 后续 reviewer 可以通过文件列表快速确认结构是否完整。
- 自检说明不要求运行外部工具或安装额外依赖。

## System-Wide Impact

- **Interaction graph:** 影响 agent / 人工协作者读取工作流入口、选择提示词、创建计划、执行 review 和沉淀经验的路径。
- **Error propagation:** 无运行时错误传播；主要风险是文档表述冲突导致 agent 选择错误流程。
- **State lifecycle risks:** `.pi/prompts/` 与 `docs/prompts/` 同时存在后可能出现内容漂移，需要在 `AGENTS.md` 说明职责边界。
- **API surface parity:** 不涉及业务 API、OpenAPI、MCP API 或部署接口。
- **Integration coverage:** 通过人工结构复核即可；无需 Rust、Node 或浏览器测试。
- **Unchanged invariants:** 五阶段流程、简体中文规范、仓库相对路径、现有 Git 提交规则、部署规则和工具优先级不变。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `docs/prompts/` 与 `.pi/prompts/` 内容漂移 | 在 README 和 `AGENTS.md` 中明确 `docs/prompts/` 是参考资产，`.pi/prompts/` 是快捷入口；阶段规则改动时同步检查两处。 |
| 外部原版模板覆盖本项目特有规则 | 不直接运行初始化脚本；手工以小 diff 增量补齐。 |
| 新增模板后历史文档风格不完全一致 | 不批量迁移历史文档；模板只约束后续新增正式文档。 |
| review 文档目录引入后被机械滥用 | `AGENTS.md` 明确“重要改动需要保留复核结论时”才写入 `docs/reviews/`。 |

## Documentation / Operational Notes

- 本任务是文档与工作流结构调整，不涉及应用构建、数据库迁移、部署或浏览器验证。
- 完成后建议执行一次聚焦文档复核：检查新增文件列表、模板内容、`AGENTS.md` 职责边界和路径规范。
- 若未来决定完全去 Pi 化，应另开 brainstorm / plan；本计划不做该迁移。

## Completion Notes

- 已补齐 `docs/prompts/`、`docs/reviews/` 和四类 `TEMPLATE.md`。
- 已修订 `AGENTS.md`，明确 `agent-light-workflow` 兼容层、Codex 参考提示词和 `.pi/prompts/` 快捷入口的职责边界。
- 已完成结构自检和 `git diff --check` 聚焦验证。
- 2026-07-30 跟进修正：外部 `agent-light-workflow` 引用固定到提交 `549e27a00a242e5a6792bb1e15a620af582a32ae`，避免上游 `main` 漂移影响历史计划含义。
- 2026-07-30 跟进修正：明确 `AGENTS.md` 与 `docs/prompts/` 是工作流规则规范源，`.pi/prompts/` 作为快捷入口跟随同步。
- 2026-07-30 跟进修正：Git 工作流从硬编码 `main` 调整为当前检出的协作分支，避免与当前 `dev` 分支实践冲突。

## Sources & References

- External: `https://github.com/ZhcChen/agent-light-workflow/tree/549e27a00a242e5a6792bb1e15a620af582a32ae`
- External: `https://github.com/ZhcChen/agent-light-workflow/blob/549e27a00a242e5a6792bb1e15a620af582a32ae/templates/project/AGENTS.md`
- External: `https://github.com/ZhcChen/agent-light-workflow/blob/549e27a00a242e5a6792bb1e15a620af582a32ae/init.sh`
- Related local workflow entry: `AGENTS.md`
- Related local prompts: `.pi/prompts/`
- Related local docs: `docs/brainstorms/`, `docs/plans/`, `docs/solutions/`
