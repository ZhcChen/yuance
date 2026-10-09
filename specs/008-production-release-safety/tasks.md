# 正式发布安全任务

输入：`spec.md`、`plan.md`

状态：已完成

## 维护与执行约束

- 已有任务先读取再增量维护，保留稳定 ID、完成状态、人工备注和验证证据；不复制模板覆盖旧任务。
- 已按只读专项审查 SQLite 在线备份、文件主密钥、发布目标与参数校验路径；未访问正式环境。
- 发布脚本、备份脚本和部署文档会串行修改；不并行写入。
- 正式发布、数据库迁移、密钥轮换和正式恢复均不在本任务授权范围内。

## 阶段一：发布目标与参数 fail-closed

- [x] T001 [US1] FR-001/FR-002 将 `scripts/deploy-production.sh` 的部署模式和构建模式改为必填，并在 Git fetch/构建/传输前验证部署模式、host、保留数量、布尔开关及超时参数。
- [x] T002 [US1] FR-008 在 `scripts/test/production-release-safety.test.cjs` 覆盖缺少/非法参数、remote 缺 host 时无 git/docker/npm/ssh/scp 副作用；依赖 T001。
- [x] T003 [US1] FR-007 更新 `scripts/validate-deploy-templates.sh`、`deploy/easy-deploy/production/README.md` 与 `docs/runbooks/production-deployment.md`，移除隐式 local 默认契约，所有发布命令显式指定模式、构建模式和目标；依赖 T001。

## 阶段二：一致性数据库与密钥备份

- [x] T004 [US2] FR-003/FR-004/FR-005/FR-006/FR-010/FR-011/FR-012 重写 `deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh`，使用 SQLite `.backup` 生成一致快照，按 Compose 优先级判定密钥来源、拒绝不可解析插值和符号链接路径、保护单份备份目录，并确保信号中断失败清理；依赖 T001。
- [x] T005 [US2] FR-008 扩展 `scripts/test/production-release-safety.test.cjs`，验证隔离 WAL 快照、密钥来源优先级、插值失败关闭、信号中断、父目录权限保持、危险路径和符号链接拒绝；依赖 T004。
- [x] T006 [US2] FR-007 更新目标机前置依赖以及 `docs/runbooks/production-deployment.md`、`docs/runbooks/api-migrations.md`、`deploy/easy-deploy/production/backend/README.md` 的备份和恢复步骤；恢复单文件快照及自动主密钥，并清理当前数据库的旧 WAL/SHM sidecar；依赖 T004。

## 复核与交付

- [x] T007 独立复核 `scripts/deploy-production.sh`、`00-backup-sqlite.sh`、发布文档和自动化测试，重点检查参数校验顺序、SQLite 快照恢复、密钥边界和副作用阻断；依赖 T001-T006。发布安全独立复核通过；备份复核确认数据目录通过物理路径与目录 inode（`-ef`）双重隔离，大小写别名和正常外置备份目录用例均通过。记录见 `docs/reviews/2026-10-09-production-release-safety-review.md`。
- [x] T008 执行脚本语法、`make deploy-validate`、参数早停测试、Docker 引用解析、物理路径隔离、Buildx 预检顺序、WAL 快照/恢复、信号中断、密钥优先级、目录权限和 `git diff --check` 验证，并将真实结果记录到本文件；依赖 T001-T007。`make deploy-safety-test`：12/12 通过、0 跳过；`YUANCE_TEST_SHELL=/bin/dash node --test scripts/test/production-release-safety.test.cjs`：12/12 通过、0 跳过；三脚本 `sh -n`、`make deploy-validate`、`git diff --check` 通过；`make spec-kit-verify`：10/10 通过；Spec Kit analyze/implement/converge 结构检查通过。未执行正式发布或恢复演练。
- [x] T009 仅暂存本轮规格、脚本、测试和 Runbook 文件，检查 staged diff，提交并按项目规则同步当前协作分支；不部署；依赖 T008。

## 验收证据

阶段一和阶段二实现、独立复核及聚焦验证已完成。正式环境发布、恢复演练及线上事实核验不在本任务授权范围内。
