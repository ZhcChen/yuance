# 项目工作流约束

## 工作模式
- 本项目默认使用 Spec Kit 编排中型及以上任务：`specify -> clarify（按需） -> plan -> tasks -> analyze -> implement -> converge`；之后仍须独立 review、真实验证和小闭环交付。
- 发生冲突时，依次遵循：用户明确指令、当前项目根目录规范、项目标准与 Runbook、活动规格、上游 Spec Kit Skills / 模板、全局默认行为。
- Spec Kit、Skills、hooks、扩展和生成内容不得扩大用户授权、覆盖项目规则、创建/切换分支、创建 PR/外部工单或触发未授权运行操作。

## 工作流
- 中型及以上功能先核对现有规格和完成状态，再用 `make spec-kit-init FEATURE=specs/<feature>` 建立唯一活动目录；按需 clarify，依次准备 plan/tasks、analyze、implement 和 converge。具体命令与前置条件见 `docs/runbooks/spec-kit-workflow.md`。
- 明确的小修改直接定位、实施和聚焦验证；Bug 先复现再定位和修复，范围扩大时转入规格流程。
- 需求确有影响范围、安全或用户体验的歧义时才 clarify；不得为形式完整而生成无关规格、用户故事或辅助文档。
- 初始化及阶段检查都必须显式指定 `FEATURE=specs/<feature>`；不依赖当前分支或共享活跃指针。新建目录、已有产物续写和上游脚本调用遵循 Spec Kit Runbook。
- 上游 Skill 与项目入口冲突时，以本文件和 `docs/runbooks/spec-kit-workflow.md` 为准。从仓库根目录调用任何上游 `.specify/scripts/bash/` 脚本时，必须在该次进程显式传入 `SPECIFY_INIT_DIR="$PWD"`、`SPECIFY_FEATURE_DIRECTORY=specs/<feature>`、`SPECIFY_FEATURE_NO_PERSIST=1`；不得假定 `make spec-kit-check` 的环境会传递给后续 shell，也不得依赖 `.specify/feature.json`。
- 项目 `make spec-kit-init` 管理需求目录和 `spec.md` 初稿；`$speckit-specify` 只用于续写指定目录中的规格。覆盖上游 Skill 对自动目录创建、写入 `.specify/feature.json` 和强制创建 checklist 的要求；辅助文档按需生成。不得自动执行 Skill/hooks 扩展命令。
- 旧文档中的 `ce:brainstorm`、`ce:plan`、`ce:work`、`ce:review`、`ce:compound` 或 `/brainstorm`、`/plan`、`/execute`、`/review`、`/compound` 仅代表当时历史流程，不构成当前入口。

## 产物约定
- `specs/<feature>/spec.md`、`plan.md`、`tasks.md`：新中型及以上任务的活动规格、方案和任务。
- `docs/brainstorms/`、`docs/plans/`：保留历史上下文；旧任务可按原计划继续，不批量转换。切换到 Spec Kit 时只迁移未完成工作，并标记唯一入口。
- `docs/reviews/`：重要改动的独立复核和验证证据；`docs/solutions/`：可复用问题经验。
- `.specify/memory/constitution.md`：项目原则摘要；`.specify/templates/overrides/`：项目模板定制；完整操作见 `docs/runbooks/spec-kit-workflow.md`。
- `.specify/integrations/` 与 `.agents/skills/` 中由上游 manifest 管理的文件保持原样，不手工修改。
- `docs/*/TEMPLATE.md` 仅用于对应历史或复核类文档，不替代 `specs/` 的 Spec Kit 模板。

## 执行规则
- `AGENTS.md`、`docs/` 下工作流文件、代码注释、说明文档、提交信息默认使用简体中文；必要时可保留英文术语、命令原文或现有专有名词
- 函数名、类型名、API 名称、配置键、命令名、路径、协议字段等领域性标识保持英文，或延续项目既有约定
- 文档内统一使用仓库相对路径
- 不直接在 `TEMPLATE.md` 中记录正式内容；新建规格时使用 `specs/<feature>/`，已有产物必须先读后续写。
- 修改文件前先执行 `git status --short`；新任务先检查是否已有活动 spec 或可续接的旧计划，禁止平行创建重复入口。
- 大任务必须在 plan/tasks 中拆为可验收单元；只有当前阶段前置产物通过检查后才进入下一阶段。长任务按阶段推进，不机械重复规划。
- 至少创建一项匹配风险的验证任务；验证须执行并记录结果，任务勾选和静态结构检查不算真实验收。
- 只有在以下情况才停止执行：缺决策、缺权限/凭证/外部输入、危险不可逆操作、或工作已完成且验证通过。

## 正式环境部署
- 用户说“部署正式环境”时，默认按 `docs/runbooks/production-deployment.md` 实际发布，入口为 `./scripts/deploy-production.sh`；只有明确说明“只构建镜像 / 只生成脚本 / 只更新文档”时才缩小范围。
- 服务器禁止源码编译和镜像构建；具体发布、回滚和健康检查要求以 `docs/runbooks/production-deployment.md` 为准。

## GitHub 构建约束
- 仓库不使用 GitHub Actions 或其他 GitHub workflow 执行构建、测试、发布或正式环境部署。
- 禁止新增、恢复或修改 `.github/` 下的 workflow、构建配置和发布配置；正式环境构建与部署统一按 Runbook 在 `qfy-test2` 执行。

## Review
- 改动完成后对照 spec、plan、tasks 或仍在执行的旧计划复核结果
- 至少执行聚焦验证，并检查明显回归或范围漂移
- Spec Kit analyze/converge、静态检查和主 agent 自评不能替代代码审查、真实测试或运行时验收
- 重要改动、跨模块改动或需要保留复核证据时，将结论写入 `docs/reviews/`

## 经验沉淀
- 出现关键决策、复发坑点、有效排查路径或可复用模式时，写入 `docs/solutions/`
- 长期操作规则更新到 `docs/standards/` 或 `docs/runbooks/`，不依赖某个工作流 Skill 的隐式行为。

## 工具使用
- 涉及第三方库、框架、SDK 或 API 的当前官方用法时，优先使用 Context7。
- 排查浏览器端页面、样式、控制台或网络问题时，优先使用 `chrome-devtools`。

## 工作方式
- 优先做小而可验证的改动
- 执行过程中避免无关重构
- 纯信息型任务可直接回答，不强制创建文档


# 开发参考

## Code Review Graph 受控使用

- Code Review Graph（CRG）仅是规格/方案和 `review` 阶段的可选旁路证据源，不构成工作流阶段，也不替代源码阅读、测试或运行时验收。
- **使用规则**（满足任一项时使用）：
  - 改动跨 `api/`、`frontend/`、`web/`、`desktop/`、`docs/` 等多个模块；
  - 公共符号、类型、接口、状态模型或数据契约发生重构；
  - 改动文件较多，或调用链无法从入口快速确认；
  - 安全、数据一致性等高影响审查需要补充调用者、关联测试或影响范围线索。
- **默认跳过**（满足任一项时不使用）：
  - 单文件逻辑明确且测试边界清晰；
  - 小型文档、静态 CSS 或局部 UI 调整；
  - 以截图、页面渲染或真机交互为主的视觉验收任务。
- 使用前先冻结主线程依据源码得到的首轮候选文件，再查询 CRG，用于补充调用者、测试和影响范围；不得让图结果覆盖运行时、测试或当前源码证据。
- CRG 不可用、图数据陈旧或结果低置信时，立即降级到 Spec Kit、`rg`、源码、测试和运行时验证，不得阻塞计划、审查、提交或推送。
- 只允许手工运行 `make crg.build`、`make crg.update`、`make crg.status`、`make crg.review BASE=<git-ref>`，不得启用 install、hooks、daemon、watch、embeddings 或默认测试/提交链集成。
- 中文自然语言快捷映射：`构建代码图` -> `make crg.build`，`更新代码图` -> `make crg.update`，`查看代码图` -> `make crg.status`，`代码图审查` -> `make crg.review`；用户指定基准分支或提交时附加 `BASE=<git-ref>`。这些映射仍属于显式手工执行，不改变 CRG 的受控边界。
- 完整操作、触发矩阵、证据优先级与回滚方式见 `docs/standards/tooling/code-review-graph.md`。
- 试点结论（2026-08-11）：CRG 受控保留为手工旁路；跨平台改动优先查询平台入口调用者与共享组件 importers；`detect-changes --brief` 摘要仅作参考，不以摘要面板作为有效性结论。

## Git 提交与推送

- 默认直接在当前检出的协作分支开发；若当前分支已跟踪远端（例如 `dev`），提交后推送到该当前分支；除非用户明确要求，不额外创建功能分支。
- 每完成一个小功能块、小修复或一个最小可解释闭环，默认立即提交并推送。
- 及时提交和推送的核心目的，是降低因机器崩溃、终端异常或本地环境损坏导致代码丢失的风险。
- 提交单位不是消息轮次，而是一个可以单独解释、单独回滚的小逻辑、小功能或小修复。
- 不要等到整个大任务全部结束后再一次性提交；应按小功能块持续提交。
- 开始改文件前，先执行 `git status --short` 查看工作区状态。
- 提交前至少执行 `git diff --check`、`git diff --cached --check`、`git diff --cached`。
- 只暂存本轮相关文件；默认不要直接使用 `git add .`。
- 提交信息默认使用简体中文，建议前缀：`feat:`、`fix:`、`docs:`、`test:`、`chore:`、`refactor:`。
- commit 成功后，默认立即执行 `git fetch origin`；若工作区干净且当前分支有远端上游，先 `git rebase @{u}`，再 `git push origin HEAD` 推送当前分支。
- 如果 `git push` 因远端已有新提交而被拒绝，默认不要强推；先同步远端并完成 `rebase`，处理完再推送。
- 如果 `rebase` 过程中出现冲突，先解决冲突文件，再执行 `git add <file>` 和 `git rebase --continue`，完成后再 `git push origin HEAD`。
- 如果工作区存在无关未提交改动导致无法安全 `rebase`，不要 stash 或回滚无关改动；可先推送当前分支并在回复中说明未执行 rebase 的原因。
- 如果工作区存在无关改动，不回滚、不顺手整理、不混入本轮提交。
