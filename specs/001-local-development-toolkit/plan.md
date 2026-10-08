# 本地开发套件实施方案

- 规格：`spec.md`
- 状态：已实现并验收，待交付

## 技术上下文

现有 SQLite/Rust API、Vite Web、Electron Desktop 的本地验收入口位于 `scripts/local-validation.sh`；无需 Redis 或 PostgreSQL。Docker 当前为本机 OrbStack，支持 ARM64 和 AMD64。现有构建和镜像 smoke 使用裸 Docker 命令，会受远程 context/builder 环境影响。Buildx inspect 当前不支持 JSON format，需核验其 Driver 和所有 Endpoint。

## 规范与约束核对

遵循 `AGENTS.md`、`docs/runbooks/spec-kit-workflow.md`；仅处理本地开发，正式部署仍遵循 production Runbook。不得删除共享 Docker context、builder 或缓存，不操作正式数据，不新增 GitHub workflow。只运行自己明确命名的本地开发容器，禁止按端口杀任意进程。

## 实现方案与文件范围

- `scripts/ops/local-docker.cjs`：隔离 Docker 环境变量，检查 Unix socket context；Buildx 固定对应 context 的 docker driver，验证节点端点，拒绝显式覆盖。作为所有本地 Docker 操作的唯一包装。
- `scripts/ops/local-dev.cjs`：统一 doctor/setup/prepare/seed/api/web/desktop/status/check 与 docker-build/up/down/logs/status/smoke。原生流程复用 local-validation，用 `.local/development/`；Docker 数据使用其中 `docker-data/`，镜像默认 `yuance-api:local`，原生平台。
- `scripts/local-validation.sh`：补 seed（只显式执行）、独立 file key、loopback/端口校验；保留已有 import-db 与验收行为。
- `deploy/local/compose.yaml`：仅 API 单容器，项目名绑定仓库路径哈希，loopback 端口和独立数据；无正式 `.env` 挂载、无源码挂载。首次 seed 用 pending 标记支持失败重试；重复 up 核验当前镜像和端口，变更时要求 down/up。
- 现有镜像构建/验收脚本默认本地模式；Make 的本地入口均指定该模式。构建测量同样使用本地包装，前端检查失败不得继续构建。正式发布脚本显式传入非本地模式以保留原有 Runbook 行为，其他发布逻辑不变。本地 AMD64 命令使用独立 tag/tar，防止混用正式镜像。
- Make/npm、README、API/Desktop README 和 `docs/runbooks/local-development.md` 统一新入口；旧 local-validation Runbook 标明用途及兼容边界。

## 阶段与依赖

1. Docker 本地包装与失败场景测试。
2. 开发命令、持久化密钥和 compose；依赖阶段 1。
3. 文档与入口、真实验证和独立审查；依赖阶段 2。
主线程串行编辑，独立只读探索/审查可并行。

## 验证与验收

执行 Node 聚焦测试，验证远程 context/builder、远程环境变量、无效地址/端口、密钥重用和隔离；执行 shell 语法与 Spec Kit 校验。实际本机 Docker 原生架构构建、迁移/core/local-admin seed、health/ready、登录、重启数据保留和停止；Web 代理和原生 API 验证。AMD64 完整构建按耗时标记真实验收边界，不用声明平台支持冒充构建成功。独立代码 review 与记录保存在 `docs/reviews/`。

## 运行与恢复

唯一操作说明为 `docs/runbooks/local-development.md`；原生 API/Web/Desktop 前台运行，Ctrl+C 停止。容器只使用独立 compose project，down 不删除本地数据。回退代码不删除数据；独立 key 必须与对应数据库一起保存。正式部署不属于本任务。
