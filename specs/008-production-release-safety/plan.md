# 正式发布安全实施方案

- 规格：`spec.md`
- 状态：已完成

## 技术上下文

正式入口 `scripts/deploy-production.sh` 当前默认 `local-wsl/local`，本地工作区校验会执行 `git fetch`；`YUANCE_KEEP_RELEASE_BACKUPS` 在镜像加载、备份、迁移和健康检查之后才校验。远程模式目前要求 host，但构建模式仍可隐式落到本地。部署模板校验器还把上述默认值写成强制契约，Easy Deploy README 省略了 remote build 参数。

`api/src/platform/db.rs` 启用 SQLite WAL。`00-backup-sqlite.sh` 当前并发复制数据库/WAL/SHM；生产 Compose 将 `./data` 和 `./backups` 分别挂载到容器 `/data`、`/backups`。目标机发布脚本目前预检 `docker`、`timeout`、`sha256sum`。目标机需增加 `sqlite3` 命令依赖，使用 SQLite CLI `.backup` 生成一致的单文件快照，再运行 `PRAGMA integrity_check`。正式路径为 `/srv/yuance/backend/data/yuance.sqlite3`。

文件主密钥由 `YUANCE_FILE_MASTER_KEY` 优先提供；未设置时应用从数据目录 `secrets/file_master_key` 读取或生成。自动密钥应被原样复制到受限备份集。若使用环境变量密钥，不得复制其值，manifest 必须标注依赖单独受控保存的环境配置。正式环境是否另有外部密钥库或 `.env` 备份未知，不作线上事实假设。

## 规范与约束核对

遵循 `AGENTS.md`、`docs/runbooks/production-deployment.md`、`docs/runbooks/api-migrations.md` 与 `.specify/memory/constitution.md`。正式运行目录不编译源码；远程构建只能写入与其物理路径隔离的专用目录；备份和校验在部署目标执行；不执行正式发布或密钥操作。单份备份目录使用 `0700`，数据库、密钥和 manifest 使用 `0600`；环境变量密钥不进入普通快照。正式入口继续兼容显式 `local-wsl`，但部署模式和构建模式均无隐式默认值。

## 实现方案与文件范围

1. 将 `YUANCE_DEPLOY_MODE` 和 `YUANCE_DEPLOY_BUILD_MODE` 变成必填项，并在 `require_clean_main`、Git fetch、本地或远程构建及文件传输前校验。remote 缺少 host、非法布尔开关、超时值和镜像备份保留值都必须早停；正式示例均显式传 `remote/remote/qfy-test2`，历史 `local-wsl` 只在显式选择时保留。
2. 发布机提前校验所有本地参数，包括重复斜杠路径、完整名称长度受限的 Docker 镜像引用和仓库内镜像 tar 符号链接；目标机在源码归档上传前解析后端/构建目录物理路径，预检远程构建所需 `node`、`npm`、`tar` 并验证 Buildx builder，再在镜像加载和数据操作前预检 `sqlite3`、Compose 配置和必要命令。保持已有正式构建、制品哈希和数据库路径不变。
3. 重写 `00-backup-sqlite.sh`：使用 `sqlite3 DB '.backup DEST'` 产生在线一致快照；确认 integrity 结果为 `ok` 后再写 manifest。密钥来源遵循 Compose 的环境优先级，无法解析的 `.env` 插值失败关闭；自动文件密钥存在且没有有效环境变量覆盖时复制到备份集 `secrets/file_master_key`。备份子目录/文件权限分别设为 `0700/0600`，不得 chmod 任意既有备份根目录；拒绝现存符号链接路径组件，信号中断需非零退出并清理。
4. 更新部署 Runbook、迁移 Runbook 和 Easy Deploy README 的先决条件、备份格式、恢复和回滚顺序。恢复必须停服务、将数据库快照和自动主密钥作为一组恢复，清理现存 WAL/SHM sidecar，之后检查完整性、迁移状态、文件对象关系和测试附件解密，再启动服务。
5. 增加 shell 行为测试：用隔离 PATH stub 确认缺少/无效参数不会调用 git/docker/npm/ssh/scp；以临时 WAL 数据库验证在线快照、数据一致性、文件密钥归档和权限；验证缺少工具、坏快照和密钥配置边界均失败关闭。测试不得连接正式目标。

主要文件：`scripts/deploy-production.sh`、`scripts/validate-deploy-templates.sh`、`deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh`、`deploy/easy-deploy/production/README.md`、`deploy/easy-deploy/production/backend/README.md`、生产/迁移 Runbook、`scripts/test/production-release-safety.test.cjs` 及必要的 npm 测试入口。该范围不需要业务数据模型或外部 API 合同。

## 阶段与依赖

阶段 1：发布参数 fail-closed、前置验证、模板校验与运行手册示例修正；添加参数无副作用测试。阶段 2：一致性 SQLite 快照、自动密钥打包/manifest、权限与失败语义；添加隔离快照测试。阶段 3：恢复/回滚手册更新，完整聚焦验证和独立数据完整性复核。

阶段 2 依赖阶段 1 确认目标机预检和参数语义。阶段文件范围有交集，串行集成；子 agent 只提供只读审查，不并行写文件。

## 验证与验收

执行 `sh -n scripts/deploy-production.sh scripts/validate-deploy-templates.sh deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh`；`node --test scripts/test/production-release-safety.test.cjs`；`make deploy-validate`；`git diff --check`。快照测试在隔离目录启用 WAL、写入明确事务标记后用 SQLite `.backup` 备份，再检查 `PRAGMA integrity_check`、记录集合、自动密钥字节一致及文件权限；另验证信号中断、空环境变量优先级、`.env` 插值失败关闭、父目录权限不变、危险路径和父级符号链接拒绝。

部署行为测试使用 stub，证明未设置参数、保留数量非法、布尔值非法及远程缺少 host 时不触发 fetch/build/transfer/load/backup/migrate/up。脚本与隔离快照验收不等同于正式环境恢复演练。

## 运行与恢复

同步 `docs/runbooks/production-deployment.md`、`docs/runbooks/api-migrations.md`、Easy Deploy README。目标机增加 `sqlite3` 前置工具；备份使用单文件快照而非主库/WAL/SHM 副本。回滚时停止 API，备份现有数据后恢复 snapshot 与同一自动密钥；若 manifest 标记环境变量密钥，必须从安全配置恢复同一值。恢复后检查完整性、迁移、文件对象审计和测试附件解密再启动。本方案不授权正式部署、数据库迁移或正式恢复。
