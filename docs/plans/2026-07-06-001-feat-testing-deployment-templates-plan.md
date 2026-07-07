---
title: feat: 准备元策测试环境部署模板
type: feat
status: active
date: 2026-07-06
---

# feat: 准备元策测试环境部署模板

## Overview

为元策准备测试服务器部署能力，整体参考 qfy-sc 测试环境的 easy-deploy 模板，但按元策当前边界做简化：只有 `api` 一个 Rust 单体服务，页面和静态资源已经编进二进制，SQLite 作为唯一持久化存储，不部署 Redis、PostgreSQL、NATS、Worker 或独立前端。

目标是在同一台 qfy-sc 测试服务器上部署元策测试环境，复用已有的服务器运维模式、Docker Compose 口径和网关管理方式，同时避免和 qfy-sc 已有 gateway 的 80/443 端口冲突。

## Problem Frame

当前元策仓库已经具备本地运行、SQLite 迁移、RBAC core seed、首次管理员初始化、健康检查和对象存储运行时配置能力，但还缺少服务器部署模板。参考项目 qfy-sc 已经有 `deploy/easy-deploy/testing/`，其模式包括 Compose 模板、app.yaml、发布阶段脚本、健康检查、网关配置和敏感配置外置。

元策需要同步这种部署规范，但不能照搬 qfy-sc 的复杂基础设施：

- qfy-sc 测试环境需要 PostgreSQL、Redis、NATS、Loki、Alloy、Worker、API、API Consumer、多套前端和 Gateway。
- 元策第一阶段只需要一个 `yuance-api` 容器和一个 SQLite 数据目录。
- 元策的 `/web` 与 `/api` 都由同一个二进制提供，根路径会跳转 `/web`。
- 测试服务器线上入口使用 Caddy；如果已有 qfy-sc Caddy gateway 占用 80/443，元策不能再启动第二套同端口 gateway，应提供可合并到共享 Caddyfile 的站点片段。

## Requirements Trace

- R1. 提供元策测试环境 easy-deploy 模板，风格与 qfy-sc 测试环境一致。
- R2. 测试环境只部署 `api` 服务，不引入 Redis、PostgreSQL、NATS、Worker 或独立前端。
- R3. API 容器监听内部 `0.0.0.0:33033`，宿主机默认只绑定 `127.0.0.1:33033`，外部访问走网关域名。
- R4. SQLite 数据目录必须持久化，并在迁移前备份数据库文件、WAL 和 SHM。
- R5. 发布流程必须显式执行 `migrate status`、`migrate up` 和 `seed core`，服务启动不自动迁移。
- R6. 测试服务器首次管理员初始化默认走 `/web` 页面由用户填写，不在发布流程执行 `seed local-admin`。
- R7. 真实密钥、会话密钥、对象存储凭证和证书不得提交；模板只提交 `.example` 文件。
- R8. 支持健康检查 `/api/healthz` 和 `/api/readyz`，并在部署后提供最小验证步骤。
- R9. 需要记录与 qfy-sc 同服务器部署时的网关、Docker 网络、日志采集和端口冲突处理方式。
- R10. 镜像必须在本地或 CI 预先构建并打包为 tar，测试服务器只允许加载镜像和运行 Compose，严禁在服务器编译源码或打包二进制。
- R11. 当前本地构建机为 arm 架构、测试服务器为 x86，构建链路必须明确产出 `linux/amd64` 镜像。

## Scope Boundaries

- 不在测试服务器上构建源码；镜像必须由本地、CI 或部署平台构建后打包 tar / 上传 / 加载。
- 不在测试服务器上执行 Rust 编译、Cargo 构建、Docker build 或源码打包。
- 不接入 Redis；进程内缓存保持现状。
- 不部署 PostgreSQL；SQLite 文件是当前唯一数据库。
- 不新增 Worker 模块；迁移、seed、文件维护都由 `yuance-api` CLI 子命令执行。
- 不自动创建测试固定超管；`seed local-admin` 保留给本地开发和自动化测试，不进入测试服务器发布流程。
- 不提交真实域名证书、私钥、数据库文件、OSS AccessKey 或 `.env`。
- 不直接修改 qfy-sc 仓库的部署模板；如需复用 qfy-sc gateway / Alloy，只在元策仓库提供需要合并的片段和说明。

## Context & Research

### Relevant Code and Patterns

- 元策配置入口：`api/src/platform/config.rs`
  - `YUANCE_HTTP_ADDR`
  - `YUANCE_DATABASE_URL`
  - `YUANCE_DATA_DIR`
  - `YUANCE_SESSION_SECRET`
  - `YUANCE_SESSION_TTL`
  - `YUANCE_CACHE_SESSION_TTL`
  - `YUANCE_LOG_LEVEL`
  - `YUANCE_ENV`
  - `YUANCE_SECURITY_MASTER_KEY`
- 元策 CLI：`api/src/app/mod.rs`
  - `yuance-api serve`
  - `yuance-api migrate status`
  - `yuance-api migrate up`
  - `yuance-api seed core`
  - `yuance-api files audit-objects`
  - `yuance-api files cleanup-pending`
- 元策迁移：`api/src/app/migrate.rs`、`api/src/platform/db.rs`
  - 迁移编译进二进制。
  - `serve` 不自动迁移。
  - SQLite 自动创建父目录，启用 WAL。
- 元策健康检查：`api/src/web/api/mod.rs`、`api/src/web/router.rs`
  - `/api/healthz`
  - `/api/readyz`
- qfy-sc 参考模板：
  - `deploy/easy-deploy/testing/README.md`
  - `deploy/easy-deploy/testing/backend/compose.yaml.example`
  - `deploy/easy-deploy/testing/backend/app.yaml.example`
  - `deploy/easy-deploy/testing/backend/scripts/90-healthcheck.sh`
  - `deploy/easy-deploy/testing/gateway/Caddyfile.qfy-sc-test.example`
  - `docs/runbooks/deployment-flow.md`
  - `docs/standards/docker-compose-naming.md`

### Institutional Learnings

- 本仓库暂无 `docs/solutions/` 沉淀可复用内容。
- 已有 `docs/runbooks/api-migrations.md` 明确：生产部署必须显式迁移、迁移前备份 SQLite、生产禁止 `seed demo` 和 `seed local-admin`。

### External References

- 本计划不需要外部资料；部署口径以当前仓库和 qfy-sc 测试环境模板为准。

## Key Technical Decisions

- 使用 easy-deploy testing 目录结构：保持与 qfy-sc 一致，方便同一套部署平台识别模板、脚本和健康检查。
- 后端只提供一个 Compose 服务 `api`：元策没有 API Consumer / Worker，拆分会制造无意义复杂度。
- 镜像名默认使用 `yuance-api:latest`：对齐 qfy-sc 测试环境固定 latest 的口径，但容器和镜像名称不额外携带 `test` 字样，版本由制品上传或镜像仓库管理。
- 本地 arm 构建机使用 Docker Buildx 产出 `linux/amd64` 镜像 tar：测试服务器是 x86，服务器侧只执行镜像加载和 Compose 启动，不参与构建。
- API 容器内部监听 `0.0.0.0:33033`：容器内健康检查和网关反代都需要可访问监听地址。
- 宿主机端口默认绑定 `127.0.0.1:33033`：避免测试服务器直接暴露 API 端口，公网入口交给网关。
- SQLite 使用容器挂载目录 `/data`：数据库、WAL、SHM 和后续本地对象存储临时数据必须脱离容器生命周期。
- 测试服务器默认 `YUANCE_ENV=testing`：表达测试环境语义，同时当前 `seed local-admin` guard 不允许 `testing`，可防止固定超管误入服务器发布流程。
- 网关默认提供 Caddy site snippet 而不是独立绑定 80/443 的 Compose：同一台 qfy-sc 测试服务器上通常已有 qfy-sc Caddy gateway，占用 80/443，元策应合并到共享 Caddyfile 或由部署平台统一网关处理。
- 日志采集只打 labels，不强制部署 Alloy：同服务器若已有 qfy-sc Alloy，需要在共享采集器 allowlist 中加入 `yuance` 后才会采集元策容器日志。

## Open Questions

### Resolved During Planning

- 是否需要 Redis：不需要，元策当前约定使用进程内缓存。
- 是否需要独立前端：不需要，HTML、CSS、JS、HTMX 和 logo 都由 Rust 二进制服务。
- 是否在测试服务器执行固定超管 seed：默认不执行，首次访问 `/web` 手动初始化，更贴近正式发布链路，也和 qfy-sc 测试环境当前口径一致。
- 是否单独部署元策 gateway：同服务器存在 qfy-sc gateway 时不应单独绑定 80/443，先提供共享 gateway 片段。

### Deferred to Implementation

- 实际测试域名：建议占位 `yuance-test.quanxinfu.com`，最终以用户和 DNS 配置确认为准。
- 共享访问方式：如果复用宿主机 Caddy，建议 Caddy 反代到宿主机 `127.0.0.1:33033`；如果未来改成容器化共享 gateway，元策 API 容器必须加入 gateway 可访问的外部网络。
- 是否接入共享 Alloy / Loki：取决于测试服务器现有 qfy-sc 日志采集配置是否允许追加 `yuance` 项目。
- 镜像构建目标：当前固定 `linux/amd64`；如果未来服务器换成 arm64，再补多架构构建。

## High-Level Technical Design

> This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.

```text
local / CI build
  -> yuance-api:latest
  -> save image tar for linux/amd64
  -> upload tar to testing server
  -> docker load on testing server
  -> easy-deploy backend compose
       -> api container
          -> /data/yuance.sqlite3
          -> yuance-api migrate status
          -> yuance-api migrate up
          -> yuance-api seed core
          -> yuance-api serve
  -> shared testing Caddy
       -> site yuance-test...
       -> reverse_proxy 127.0.0.1:33033
  -> user opens /web
       -> first admin initialization
```

## Implementation Units

- [ ] **Unit 1: API Docker image**

**Goal:** 为 `yuance-api` 提供可部署的 Linux 容器镜像构建模板。

**Requirements:** R1, R2, R3, R7, R10, R11

**Dependencies:** None

**Files:**
- Create: `api/Dockerfile`
- Modify: `api/README.md`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- 使用多阶段构建，builder 阶段编译 Rust workspace 中的 `yuance-api`。
- 构建流程必须支持从 arm 本机构建 `linux/amd64` 镜像，并把镜像保存为 tar 制品。
- runtime 阶段只保留二进制、CA 证书、时区数据和健康检查需要的最小工具。
- 确认 Askama 模板、迁移、CSS、JS、logo、HTMX 都已编译或嵌入，不依赖运行时源码目录。
- 容器默认启动 `./yuance-api serve`。
- 暴露内部端口 33033。

**Patterns to follow:**
- qfy-sc repo: `api/Dockerfile`
- qfy-sc repo: `worker/Dockerfile`
- 元策静态资源嵌入：`api/src/web/router.rs`
- 元策迁移嵌入：`api/src/platform/db.rs`

**Test scenarios:**
- Happy path: 构建镜像后启动容器，`/api/healthz` 返回 200。
- Happy path: 在 arm 本机构建出的 tar 加载后，镜像架构为 `linux/amd64`，可在 x86 测试服务器运行。
- Happy path: 容器内使用嵌入资源访问 `/static/app.css`、`/static/vendor/htmx.min.js` 和 `/favicon.ico`。
- Error path: 未设置生产密钥时不应把 `.env.example` 的占位值当成可接受上线配置，部署文档必须明确阻断。
- Integration: 镜像运行后执行 `migrate up` 能创建 SQLite 数据库并使 `/api/readyz` 返回 200。

**Verification:**
- 镜像能够在目标架构启动。
- 镜像 tar 可被 x86 测试服务器加载并运行。
- 容器无需挂载源码目录即可提供 `/web`、`/api` 和静态资源。

- [ ] **Unit 2: easy-deploy backend 模板**

**Goal:** 提供元策测试后端的 Compose、app.yaml、环境变量示例和发布阶段脚本。

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R10

**Dependencies:** Unit 1

**Files:**
- Create: `deploy/easy-deploy/testing/README.md`
- Create: `deploy/easy-deploy/testing/backend/README.md`
- Create: `deploy/easy-deploy/testing/backend/app.yaml.example`
- Create: `deploy/easy-deploy/testing/backend/compose.yaml.example`
- Create: `deploy/easy-deploy/testing/backend/.env.example`
- Create: `deploy/easy-deploy/testing/backend/scripts/00-backup-sqlite.sh`
- Create: `deploy/easy-deploy/testing/backend/scripts/10-migrate-status.sh`
- Create: `deploy/easy-deploy/testing/backend/scripts/20-migrate-up.sh`
- Create: `deploy/easy-deploy/testing/backend/scripts/30-seed-core.sh`
- Create: `deploy/easy-deploy/testing/backend/scripts/80-files-audit.sh`
- Create: `deploy/easy-deploy/testing/backend/scripts/90-healthcheck.sh`
- Modify: `README.md`
- Test: `api/tests/cli_migrate_flow.rs`
- Test: `api/tests/cli_seed_flow.rs`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- easy-deploy 应用建议名和 Compose 顶层名称使用 `yuance`。
- 服务名使用 `api`，容器名建议使用 `yuance-api`，便于日志、排障和手工运维识别。
- 镜像变量使用 `YUANCE_API_IMAGE`，默认 `yuance-api:latest`。
- Compose 模板只消费已经存在于服务器 Docker daemon 的镜像，不包含 build 配置。
- 环境变量全部使用 `YUANCE_*`，敏感值通过 `.env` 或部署平台注入。
- 持久化挂载 `./data:/data`，默认数据库 URL 使用容器内绝对路径。
- `YUANCE_ENV` 默认 `testing`，发布流程只跑 `seed core`，不跑 `seed demo` 和 `seed local-admin`。
- 发布脚本顺序明确区分：备份、迁移校验、迁移执行、基础 seed、文件对象盘点、健康检查。
- 健康检查同时覆盖 `/api/healthz` 和 `/api/readyz`。

**Patterns to follow:**
- qfy-sc repo: `deploy/easy-deploy/testing/backend/compose.yaml.example`
- qfy-sc repo: `deploy/easy-deploy/testing/backend/app.yaml.example`
- qfy-sc repo: `deploy/easy-deploy/testing/backend/scripts/90-healthcheck.sh`
- 元策 runbook: `docs/runbooks/api-migrations.md`

**Test scenarios:**
- Happy path: 使用测试 `.env` 启动后端容器，迁移和 core seed 能幂等执行。
- Happy path: 重复执行 `seed core` 不重复创建 RBAC 数据。
- Edge case: SQLite 数据库存在 `-wal` 和 `-shm` 文件时，备份脚本同时保存三类文件。
- Error path: `migrate status` 发现 checksum 漂移或未知迁移时发布脚本失败并阻止继续。
- Error path: `YUANCE_ENV=testing` 执行 `seed local-admin` 应失败，不得创建固定账号。
- Error path: Compose 模板不得包含 `build:`；如果服务器没有加载 `yuance-api:latest`，启动应失败而不是在服务器构建。
- Integration: 发布完成后用户访问 `/web` 能进入首次管理员初始化页面。

**Verification:**
- 模板不包含真实密钥。
- Compose 可在测试服务器单目录启动，`data/`、`backups/` 与 `compose.yaml` 同级映射到宿主机。
- 发布脚本符合“先备份、再迁移、再 seed、再启动/健康检查”的顺序。

- [ ] **Unit 3: Caddy 网关接入模板**

**Goal:** 为同服务器测试环境提供元策域名的 Caddy 站点片段，避免单独 gateway 与 qfy-sc Caddy gateway 端口冲突。

**Requirements:** R1, R3, R8, R9

**Dependencies:** Unit 2

**Files:**
- Create: `deploy/easy-deploy/testing/gateway/README.md`
- Create: `deploy/easy-deploy/testing/gateway/Caddyfile.yuance-test.example`

**Approach:**
- 不默认提供绑定 80/443 的独立 gateway Compose。
- 提供可合并进 qfy-sc 测试 Caddyfile 或共享测试 Caddy 的 site block。
- 默认站点域名使用占位域名，实施前必须替换为实际域名。
- 反代目标优先使用宿主机本地端口 `127.0.0.1:33033`，与 qfy-sc 测试 Caddyfile 的 `reverse_proxy 127.0.0.1:<port>` 口径一致。
- Caddy 默认会转发必要代理头，模板只保留元策需要的压缩和反代配置。
- 所有路径都反代到 API，因为 `/web`、`/api`、`/static` 和 `/favicon.ico` 都由同一服务处理。

**Patterns to follow:**
- qfy-sc repo: `deploy/easy-deploy/testing/gateway/Caddyfile.qfy-sc-test.example`

**Test scenarios:**
- Happy path: 访问域名根路径应跳转或返回 `/web` 页面。
- Happy path: 访问 `/api/healthz` 经网关返回 200。
- Happy path: 访问 `/static/app.css` 经网关返回 CSS。
- Error path: API 容器不可用时网关返回 502，不应错误落到 qfy-sc 前端静态目录。
- Integration: 登录、CSRF、HTMX 请求在反代后保持 cookie 和 header 行为正常。

**Verification:**
- 元策网关配置不会绑定已被 qfy-sc Caddy gateway 使用的 80/443。
- 共享 Caddy 能通过宿主机本地端口访问 `yuance-api`。

- [ ] **Unit 4: 部署运行手册与操作边界**

**Goal:** 写清楚测试服务器首次部署、更新发布、回滚、备份、管理员初始化和对象存储初始化流程。

**Requirements:** R4, R5, R6, R7, R8, R9

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Create: `docs/runbooks/testing-deployment.md`
- Modify: `docs/runbooks/api-migrations.md`
- Modify: `docs/runbooks/file-maintenance.md`
- Modify: `docs/runbooks/aliyun-oss-manual-validation.md`
- Modify: `README.md`

**Approach:**
- 明确测试服务器推荐环境变量：
  - `YUANCE_ENV=testing`
  - `YUANCE_HTTP_ADDR=0.0.0.0:33033`
  - `YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3`
  - `YUANCE_DATA_DIR=/data`
  - 稳定随机 `YUANCE_SESSION_SECRET`
  - 稳定随机 `YUANCE_SECURITY_MASTER_KEY`
- 明确首次部署顺序：
  - 准备 Docker 网络和数据目录。
  - 从本地或 CI 获取已经构建好的 `linux/amd64` 镜像 tar。
  - 在测试服务器加载镜像 tar。
  - 注入 `.env`。
  - 执行迁移与 core seed。
  - 启动容器。
  - 配置共享网关。
  - 访问 `/web` 手动初始化首个管理员。
  - 配置 OSS 并执行桶检测 / 初始化。
- 明确更新发布顺序：
  - 备份 SQLite。
  - 上传并加载新的镜像 tar。
  - 执行迁移校验和迁移。
  - 执行 core seed。
  - 重启服务。
  - 健康检查和浏览器 smoke。
- 明确回滚只能通过恢复 SQLite 备份和旧镜像完成，不支持 SQLite down migration。
- 明确测试服务器不要执行 `seed local-admin`；如果用户后续明确要求“演示环境固定账号”，必须另起设计并重新评估 `YUANCE_ENV` guard。
- 明确禁止在测试服务器运行 Cargo、Docker build 或任何源码编译打包步骤。

**Patterns to follow:**
- qfy-sc repo: `docs/runbooks/deployment-flow.md`
- 元策 runbook: `docs/runbooks/api-migrations.md`
- 元策 OSS runbook: `docs/runbooks/aliyun-oss-manual-validation.md`

**Test scenarios:**
- Documentation: runbook 明确列出首次部署、日常发布、回滚和禁止事项。
- Documentation: runbook 明确区分测试服务器和本地开发测试环境。
- Documentation: runbook 明确 arm 本机构建 `linux/amd64` 镜像 tar、x86 服务器加载 tar 的链路。
- Error path: 文档明确 `YUANCE_SECURITY_MASTER_KEY` 丢失或变更会导致旧 OSS 密钥密文不可解密。
- Integration: 文档覆盖从网关域名访问 `/web` 到首次管理员初始化，再到 OSS 配置初始化的完整链路。

**Verification:**
- 运维人员不需要阅读源码即可按 runbook 完成测试环境部署。
- 禁止事项与 `docs/runbooks/api-migrations.md` 不冲突。

- [ ] **Unit 5: 部署模板校验与质量门禁**

**Goal:** 增加轻量校验，避免部署模板和当前 API 端口、健康检查、环境变量漂移。

**Requirements:** R1, R3, R5, R7, R8

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4

**Files:**
- Create: `scripts/validate-deploy-templates.sh`
- Modify: `Makefile`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- 新增 Makefile 目标用于校验部署模板文件存在、脚本可执行、敏感文件未提交。
- 校验 Compose 模板中端口和健康检查路径与当前路由一致。
- 校验文档不包含真实 `.env`、AccessKey、私钥片段。
- 保持校验为本地静态检查，不依赖测试服务器。

**Patterns to follow:**
- `scripts/browser-smoke.sh`
- qfy-sc repo: `api/scripts/compose_fixture_smoke.py`

**Test scenarios:**
- Happy path: 部署模板完整时校验通过。
- Error path: 缺少脚本执行权限或模板文件时校验失败并输出明确文件路径。
- Error path: 模板意外包含 `.env` 或私钥关键词时校验失败。

**Verification:**
- 提交前可以用一个 Makefile 目标发现部署模板漂移。

## System-Wide Impact

- **Interaction graph:** 部署模板会影响 Docker 镜像、Compose 运行、SQLite 数据文件、共享 gateway、健康检查、对象存储配置和首次管理员初始化。
- **Error propagation:** 迁移失败必须在发布脚本阶段失败，不允许服务带旧库结构启动；健康检查失败必须阻断发布完成状态。
- **State lifecycle risks:** SQLite 是单文件主存储，发布前必须备份主库、WAL、SHM；容器删除不得删除 `./data`。
- **API surface parity:** `/web`、`/api`、`/static`、`/favicon.ico` 都由同一 API 容器提供，网关不能只转发 `/api`。
- **Integration coverage:** 需要至少一次通过网关域名验证登录、CSRF 表单、HTMX 局部请求、静态资源、OSS 配置页和健康检查。
- **Unchanged invariants:** 不改变业务路由、不改变 33033 默认端口、不改变 local-admin seed 的生产拒绝边界、不引入 Redis。

## Risks & Dependencies

- 风险：共享测试服务器已有 Caddy gateway 占用 80/443。
  - 缓解：只提供 Caddy site snippet，要求合并到共享 Caddyfile，不默认起第二个 80/443 gateway。
- 风险：本地 arm 构建出错误架构镜像导致 x86 测试服务器无法运行。
  - 缓解：构建链路固定 `linux/amd64`，发布前检查镜像架构；服务器只加载 tar，不重新构建。
- 风险：跨架构 Buildx 构建 Rust 镜像速度较慢。
  - 缓解：第一版接受较慢构建；后续可引入 CI x86 runner 或交叉编译缓存优化。
- 风险：SQLite 数据目录未挂载或被误删。
  - 缓解：Compose 必须挂载 `./data:/data`，runbook 和备份脚本必须覆盖数据库、WAL、SHM。
- 风险：`YUANCE_SECURITY_MASTER_KEY` 变更导致 OSS 密钥无法解密。
  - 缓解：部署文档把该变量列为稳定强随机值，禁止发布时轮换；如需轮换另行设计重加密流程。
- 风险：测试服务器误执行 `seed local-admin`。
  - 缓解：默认 `YUANCE_ENV=testing`，当前 guard 不允许该命令；发布脚本不包含 local-admin。
- 风险：共享 Alloy 默认不采集 `yuance` 日志。
  - 缓解：Compose 加日志 label；runbook 说明如需 Loki 日志，必须在共享 Alloy allowlist 中显式加入 `yuance`。
- 风险：容器内 root 用户写入数据目录带来权限管理粗糙。
  - 缓解：第一版可接受；后续如引入非 root runtime，需要补数据目录 owner 初始化策略。
- 风险：测试域名未定导致 gateway 模板无法直接使用。
  - 缓解：模板使用占位域名，实施前由用户确认实际域名。

## Documentation / Operational Notes

- 建议默认测试域名占位：`yuance-test.quanxinfu.com`。
- 建议默认服务器目录：`/srv/yuance/easy-deploy/testing/backend`。
- 建议默认 easy-deploy 应用名：`yuance`。
- 建议默认容器名：`yuance-api`。
- 建议默认镜像：`yuance-api:latest`。
- 建议默认镜像制品：`yuance-api-linux-amd64.tar`。
- 建议默认数据目录：`deploy/easy-deploy/testing/backend/data` 挂载到容器 `/data`。
- 建议测试服务器不运行 `seed demo`；如果后续需要演示数据，先决定是否把演示数据 seed 与固定超管 seed 解耦。
- 对象存储配置仍通过 `/web/system/storage` 保存，发布环境变量不保存 OSS AccessKey。

## Sources & References

- Related code: `api/src/platform/config.rs`
- Related code: `api/src/platform/db.rs`
- Related code: `api/src/app/mod.rs`
- Related code: `api/src/app/migrate.rs`
- Related code: `api/src/app/seed.rs`
- Related code: `api/src/web/router.rs`
- Related code: `api/src/web/api/mod.rs`
- Related docs: `docs/runbooks/api-migrations.md`
- Related docs: `docs/runbooks/aliyun-oss-manual-validation.md`
- qfy-sc reference: `deploy/easy-deploy/testing/README.md`
- qfy-sc reference: `deploy/easy-deploy/testing/backend/compose.yaml.example`
- qfy-sc reference: `deploy/easy-deploy/testing/backend/app.yaml.example`
- qfy-sc reference: `deploy/easy-deploy/testing/gateway/Caddyfile.qfy-sc-test.example`
- qfy-sc reference: `docs/runbooks/deployment-flow.md`
- qfy-sc reference: `docs/standards/docker-compose-naming.md`
