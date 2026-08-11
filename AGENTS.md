# 项目工作流约束

## 工作模式
- 本项目默认采用基于 `agent-light-workflow` 的 Compound Engineering（CE）轻工作流；同一项任务默认只采用一套主工作流，避免混用其他设计、计划或执行流程。
- 发生冲突时，依次遵循：用户明确指令、当前项目根目录规范、CE 工作流约定、全局默认行为。

## 工作流
- 默认按 `brainstorm -> plan -> execute -> review -> compound` 推进
- `brainstorm` 只在需求不清、范围未定、方案分叉或未知项较多时启用
- 需求已清晰时，直接进入 `plan`
- `docs/prompts/*.md` 是给 Codex 复用的参考提示词，可直接复制或按任务改写，不代表隐藏命令或专用 runtime
- 工作流规则的规范源为 `AGENTS.md` 与 `docs/prompts/`
- 历史文档中的 `ce:brainstorm`、`ce:plan`、`ce:work`、`ce:review`、`ce:compound` 或 `/brainstorm`、`/plan`、`/execute`、`/review`、`/compound` 表述，语义上分别对应当前 `brainstorm`、`plan`、`execute`、`review`、`compound` 阶段

## 产物约定
- `docs/brainstorms/`：需求澄清与方案收敛
- `docs/plans/`：执行计划
- `docs/reviews/`：重要改动的复核与验证记录
- `docs/solutions/`：问题沉淀与经验复用
- `docs/prompts/`：Codex 可复制或改写的轻工作流参考提示词
- CE 运行期中间产物：`.context/compound-engineering/`，不纳入版本控制
- `docs/*/TEMPLATE.md` 只作结构参考；正式文档优先使用具体文件名，例如 `YYYY-MM-DD-short-name.md`

## 执行规则
- `AGENTS.md`、`docs/` 下工作流文件、代码注释、说明文档、提交信息默认使用简体中文；必要时可保留英文术语、命令原文或现有专有名词
- 函数名、类型名、API 名称、配置键、命令名、路径、协议字段等领域性标识保持英文，或延续项目既有约定
- 文档内统一使用仓库相对路径
- 不直接在 `TEMPLATE.md` 中记录正式内容；需要新建文档时，复制结构并写入同目录下的具体文件
- 有现成的 brainstorm 或 plan 时，优先复用和续写，不重复开平行文档
- 大任务必须先在 plan 中拆出阶段和执行单元；默认不要把整个大任务直接作为单个 `/goal`
- 开始改动前先确认当前任务对应的 plan；长任务优先使用 `/goal`，且 `/goal` 默认绑定当前阶段或一组连续单元
- 只有在以下情况才停止执行：缺决策、缺权限/凭证/外部输入、危险不可逆操作、或工作已完成且验证通过

## 正式环境部署
- 用户说“部署正式环境”时，默认按 `docs/runbooks/production-deployment.md` 实际发布，入口为 `./scripts/deploy-production.sh`；只有明确说明“只构建镜像 / 只生成脚本 / 只更新文档”时才缩小范围。
- 服务器禁止源码编译和镜像构建；具体发布、回滚和健康检查要求以 `docs/runbooks/production-deployment.md` 为准。

## Review
- 改动完成后对照 plan 复核结果
- 至少执行聚焦验证，并检查明显回归或范围漂移
- 重要改动、跨模块改动或需要保留复核证据时，将结论写入 `docs/reviews/`

## Compound
- 出现关键决策、复发坑点、有效排查路径或可复用模式时，写入 `docs/solutions/`

## 工具使用
- 涉及第三方库、框架、SDK 或 API 的当前官方用法时，优先使用 Context7。
- 排查浏览器端页面、样式、控制台或网络问题时，优先使用 `chrome-devtools`。

## 工作方式
- 优先做小而可验证的改动
- 执行过程中避免无关重构
- 纯信息型任务可直接回答，不强制创建文档


# 开发参考

## Code Review Graph 受控使用

- Code Review Graph（CRG）仅是 `plan` / `review` 阶段的可选旁路证据源，不构成第六个工作流阶段，也不替代源码阅读、测试或运行时验收。
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
- CRG 不可用、图数据陈旧或结果低置信时，立即降级到原 CE 流程、`rg`、源码、测试和运行时验证，不得阻塞计划、审查、提交或推送。
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
