# 正式发布安全复核

## 标题信息

- 主题：发布目标 fail-closed 与 SQLite 一致性备份
- 关联计划：`specs/008-production-release-safety/`
- 审查范围：发布参数校验、目标机预检、SQLite 在线快照、密钥备份边界、恢复文档与自动化测试
- 负责人：Codex
- 日期：2026-10-09

## 目标对齐

复核本次改动是否在发布或恢复目标不明确、参数无效、快照不完整或密钥来源不明时停止，并确认文档没有将隔离测试描述为正式恢复演练。

## 已执行验证

- `make deploy-safety-test`：12/12 通过，0 跳过。
- `YUANCE_TEST_SHELL=/bin/dash node --test scripts/test/production-release-safety.test.cjs`：12/12 通过，0 跳过。
- `sh -n scripts/deploy-production.sh scripts/validate-deploy-templates.sh deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh`：通过。
- `make deploy-validate`：通过。
- `make spec-kit-verify`：10/10 通过。
- `make spec-kit-check FEATURE=specs/008-production-release-safety STAGE=analyze`、`STAGE=implement`、`STAGE=converge`：三个阶段结构检查分别通过。
- `git diff --check`：通过。
- 独立只读复核确认发布参数和远程 Buildx/依赖预检早于发布副作用；备份复核确认在线快照、密钥来源边界、信号失败清理和数据目录物理路径隔离。备份目录大小写别名用例与正常外置备份用例均通过。

## 主要发现

### 必须修正的问题

- 无。复核过程中发现的大小写路径别名隔离缺口已由物理路径检查和目录 inode（`-ef`）比较修正，并通过本机测试。

### 可接受的残留项

- 未连接正式环境；没有读取正式数据库或密钥，也没有执行正式发布、迁移、恢复或恢复演练。
- 目标机现在需要 `sqlite3` 命令；正式运行环境是否已具备该依赖未经验证，发布前置检查会在缺少时停止。
- `.env` 中无法安全解析的密钥插值/转义会拒绝备份，需改为受控环境变量或受支持的字面量配置。

### 建议后续跟进

- 按正式发布 Runbook，在获授权的维护窗口前确认目标机 `sqlite3` 可用，并由运维在独立演练环境验证恢复流程；此记录不替代该演练。

## 与计划的一致性

- 发布参数显式化、目标机预检、WAL 一致快照、自动密钥保护、失败清理、恢复文档与隔离行为测试均符合 `specs/008-production-release-safety/`。
- 未执行规格明确排除的正式发布、数据库迁移、密钥轮换和正式恢复。

## 回归与风险

- 未发现已验证范围内的明显回归。
- 仍需在正式环境发布前确认目标机依赖；任何真实恢复行为仍需独立演练和授权。

## 结论

- 结论：通过。
- 下一步：提交本地改动并同步当前协作分支；不部署。
