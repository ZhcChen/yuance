# Spec Kit 工作流迁移复核

> 日期：2026-10-08
>
> 对应计划：`docs/plans/2026-10-08-001-refactor-spec-kit-workflow-migration-plan.md`

## 结论

迁移范围与计划一致：新增项目级 Spec Kit 资产、显式需求目录入口和阶段结构检查；历史文档保留；未改业务代码、生产配置、用户级 Codex 设置或部署流程。

## 复核发现与处理

- 上游 plan、tasks、clarify、analyze、implement、converge Skill 会直接调用 Bash 脚本，不会继承先前 `make spec-kit-check` 子进程的环境。未设置环境变量时会失败；存在旧 `.specify/feature.json` 时会选择错误目录。已在 `AGENTS.md` 与 `docs/runbooks/spec-kit-workflow.md` 明确覆盖调用格式，并增加回归测试验证各脚本显式使用同一 `FEATURE`、忽略旧指针且不回写指针。
- 上游 specify Skill 会自动创建目录、写入 `.specify/feature.json` 和强制生成 checklist；上游 plan Skill 默认生成额外研究/设计文件。项目规范现明确由 `make spec-kit-init` 管理目录和初始规格，指针禁止持久化，checklist 与辅助文档按需创建，hooks 不自动执行；上游受管理文件保持原样。
- 原文档权威顺序把代码和运行事实放在工程标准之前，可能把现状误读成规范。已拆为规范权威与事实核验顺序，并声明行为证据不授予规则覆盖权。
- `.specify` 根目录、所有上游 Bash 脚本、模板、需求目录与核心产物的静态符号链接均被拒绝；核心产物通过 `O_NOFOLLOW` 打开。常规本机路径 API 不能抵御恶意并发进程在校验与目录写入之间替换父目录，此项不是完整沙箱保证，当前按单一写入者工作区约束管理。

## 验证

- `make spec-kit-verify`：10 项通过。
- `node --check scripts/ops/spec-kit.cjs` 与 `node --check scripts/test/spec-kit.test.cjs`：通过。
- `uv tool run --from specify-cli==1.1.2 specify version`：确认版本 `1.1.2`。
- `uv tool run --from specify-cli==1.1.2 specify integration status --json`：`status=ok`，仅安装 Codex，manifest 检查无缺失、漂移或无效路径。
- `make crg.update` 与 `make crg.review BASE=HEAD`：52 个 staged 文件，0 个变更函数、受影响 flow 或测试缺口，风险分 0。
- `git diff --check`：通过。

没有执行业务构建、浏览器验收或部署。项目 Skills 的原生加载情况和首次实际业务需求闭环尚未验证，不能由 manifest 与静态回归测试替代。
