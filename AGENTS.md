# CE 项目提示词模板

> 说明：这是 **Compound Engineering (CE)** 在 Codex CLI 下的项目级 `AGENTS.md` 模板。
> 当某个项目希望以 CE 作为主要 AI 工作架构时，将本文件复制到该项目根目录并重命名为 `AGENTS.md`。
> 如果项目已经有自己的 `AGENTS.md`，请将其中与 CE 相关的规则合并进去，而不是盲目覆盖。

## 工作模式
- 本项目默认启用 **Compound Engineering (CE)** 作为主要 AI 工作架构。
- 在没有用户明确要求切换流程的情况下，优先使用 CE 的工作流，避免混入其他并行流程。
- **同一项任务默认只采用一套主工作流。** 若当前任务已明确选择 CE，就不要再混入其他设计/计划/执行流程。
- 若用户明确指定使用其他流程、已有项目规范与 CE 冲突，或当前任务只是一次小型查询/解释，则以用户指令和项目现有规范为准。

## Git 分支与提交规则
- 本项目后续默认直接在 `main` 分支开发、提交和推送。
- 历史功能分支合并回 `main` 后视为归档，不再继续在该功能分支上追加开发。
- 除非用户明确要求新建功能分支、PR 流程或隔离 worktree，否则不要主动创建 feature 分支。
- 开始修改前先确认当前分支；若不在 `main`，应先提醒并切回 `main`，避免后续改动散落到旧分支。
- 用户明确要求实现、修复、调整、完善、联调或继续任务时，视为授权在任务达到稳定可验收状态后自行提交并推送；每轮完成一个小逻辑 / 小功能 / 小修复后，默认按最小可解释业务闭环 commit，并立即 `git push` 到当前分支。
- “继续”“开始吧”“可以”“按照建议继续”等泛化回复只继承当前明确任务的提交范围，不授权把工作区所有未提交改动一起提交，也不授权跨任务整理提交。
- 一次用户任务包含多个相对独立功能点时，按功能边界、风险边界或可验证阶段拆分为多个 commit；同一页面 / 同一模块内连续的小样式、小文案或小交互修复可以合并为一个 commit，但 migration、seed、生成代码、部署配置、lockfile 默认单独成组。
- 提交说明默认使用简体中文，概括本次 commit 的业务目的和改动范围；可使用 `feat:`、`fix:`、`docs:`、`test:`、`chore:` 等前缀，但不要为了格式牺牲可读性。
- 每轮任务开始和提交前必须查看 `git status --short`；提交时只 stage 本轮相关文件，禁止默认使用 `git add .`。如果工作区存在用户或其他任务留下的无关改动，应拆开提交或保留不动；若同一文件混有本轮改动和旧改动，必须逐段检查并只暂存本轮意图，无法安全拆分时暂不提交并说明原因。
- 提交前应完成与改动范围匹配的测试、构建、格式检查或页面验证，最低要求执行 `git diff --check` 并查看 staged diff；涉及 migration 时必须运行迁移和相关测试，涉及部署 / env / 密钥时必须确认没有真实敏感信息进入 diff。
- 不提交明显编译失败、测试失败或半成品状态，除非用户明确要求保存现场；这种情况下 commit message 必须标明 `WIP` / 阻塞点，并仍需及时 push。完整细则见 `docs/standards/git-workflow.md`。

## CE 默认工作流
按任务类型优先采用以下顺序：

1. **需求不清、范围未定、要先讨论方向**
   - 优先使用 `ce:brainstorm`
   - 产出写入 `docs/brainstorms/`

2. **需求已清晰，需要技术方案或拆解实施计划**
   - 优先使用 `ce:plan`
   - 产出写入 `docs/plans/`

3. **进入执行阶段，需要按计划落地**
   - 优先使用 `ce:work`
   - 若明确需要实验性的外部委派模式，可使用 `ce:work-beta`

4. **代码改动完成，需要审查质量、风险与规范**
   - 优先使用 `ce:review`

5. **问题解决后，需要沉淀经验与复用知识**
   - 优先使用 `ce:compound`
   - 历史知识漂移或过期时使用 `ce:compound-refresh`
   - 产出写入 `docs/solutions/`

## 产物约定
- 需求/产品定义：`docs/brainstorms/`
- 技术计划：`docs/plans/`
- 解决方案/经验沉淀：`docs/solutions/`
- CE 运行期中间产物：`.context/compound-engineering/`

除非项目已有明确不同约定，否则遵守以上目录布局。

## 执行规则
- 在 CE 工作流中，优先保证：**先澄清，再规划，再执行，再审查，再沉淀**。
- 对于跨文件、跨模块、带有不确定性的任务，不要跳过 `ce:brainstorm` 或 `ce:plan` 直接编码，除非用户明确要求。
- 所有文档中的路径引用都使用**仓库相对路径**，不要使用绝对路径。
- 当任务已经有现成计划文件或 brainstorm 文档时，优先复用和续写，不要重复生成平行文档。
- 用户后续说“部署正式环境”时，默认含义是按 `docs/runbooks/production-deployment.md` 将元策正式环境实际部署到服务器 `qfy-sc-test`；部署口径对齐参考项目 qfy-sc 的测试环境：本地构建 `linux/amd64` 镜像 tar、上传制品、服务器 `docker load`、单次维护容器执行迁移和 `seed core`、`docker compose up -d`、Caddy 接入或 reload 以及健康检查，不依赖 easy-deploy 平台，也不在服务器编译或构建镜像。除非用户明确说“只准备部署文档 / 只构建镜像 / 只生成脚本”，不要把该指令理解为仅做本地准备。
- 若项目中同时存在人工规范、项目 `AGENTS.md`、其他 AI 说明文件，则遵循：
  1. 用户明确指令
  2. 当前项目根目录下的规范文件
  3. CE 工作流约定
  4. 全局默认行为

<!-- BEGIN COMPOUND CODEX TOOL MAP -->
## Compound Codex Tool Mapping (Claude Compatibility)

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:
- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure — always wait for the user's response before proceeding.
- Task/Subagent/Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TodoWrite/TodoRead: use file-based todos in todos/ with todo-create skill
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
<!-- END COMPOUND CODEX TOOL MAP -->
