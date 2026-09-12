---
title: 工作项主发布内容关联资料库正式环境部署复核
type: review
status: completed
date: 2026-09-12
---

# 工作项主发布内容关联资料库正式环境部署复核

## Go/No-Go 结果

- 结论：Go，已完成正式环境发布。
- 发布提交：`991f390`（`feat: 支持工作项发布内容关联资料库`）。
- 部署目标：`qfy-test2`，运行目录 `/srv/yuance/backend`。
- 发布模式：`YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_HOST=qfy-test2`。
- 正式入口：`https://yuance.quanxinfu.com`。
- 网关配置未改动，既有 FRP/Nginx 入口验证通过。

## 发布前检查

- [x] `main` 工作区干净，`HEAD` 与 `origin/main` 均为 `991f390`。
- [x] `./scripts/validate-deploy-templates.sh` 通过。
- [x] `sh -n scripts/deploy-production.sh scripts/build-api-image-amd64.sh` 通过。
- [x] `npm run check:frontend` 通过，Web、前端 workspace、Desktop renderer 检查和测试均通过。
- [x] 镜像目标平台为 `linux/amd64`。
- [x] 由于 Docker Hub 临时返回 TLS/registry `EOF`，标准构建脚本首次在基础镜像元数据解析阶段停止，未执行任何远程发布。
- [x] 使用 BuildKit 已缓存的 AMD64 Node/Rust 基础层和本机 AMD64 Debian runtime 层完成等价构建；前端检查已在首次构建阶段通过，构建阶段使用 `YUANCE_SKIP_FRONTEND_CHECK=1` 避免重复检查。
- [x] 当前提交重新生成镜像 tar，而非复用旧发布 tar。
- [x] 本地镜像 tar SHA256：`90161b7c08b013aedf275e0305a7860037f7d36f641ac5b0de671b2298a29691`。

## 发布执行证据

- 远端镜像 tar SHA256 与本地一致。
- qfy-test2 发布前旧镜像回滚制品：`/srv/yuance/releases/yuance-api-linux-amd64.before-20260912111252.tar`。
- SQLite 发布前备份目录：`qfy-test2:/srv/yuance/backend/backups/20260912031258`。
- 迁移执行前状态：`applied=34 total=35`。
- 新迁移 `202609110002 create project resource work item links` 执行成功。
- 迁移执行后状态：`applied=35 total=35`，`migration state: ok`。
- `seed core` 执行成功；未执行 `seed demo`、`seed local-admin` 或 dangling image 清理。
- `yuance-api` 已通过 `docker compose up -d --force-recreate` 重建并启动。

## 发布后验证

- [x] Compose 状态：`yuance-api` 为 `running`、`healthy`，端口仍为 `127.0.0.1:33033`。
- [x] 运行容器镜像 ID：`sha256:cb40f2111ded9280aefd9ab701f40087167263da2ae55f9bfa0a0e2d067053b8`，脚本已验证运行镜像与 `yuance-api:latest` 一致。
- [x] SQLite `PRAGMA integrity_check;`：返回 `ok`。
- [x] `project_resource_work_item_links` 表存在，发布后关系行数为 `0`，未产生意外数据。
- [x] 文件对象审计：`total=140`、`attached=140`、`orphan=0`、`pending_orphan=0`、`uploaded_orphan=0`、`deleted_orphan=0`。
- [x] 公网 `/api/healthz`：HTTP 成功，返回 `status=ok`。
- [x] 公网 `/api/readyz`：HTTP 成功，返回 `status=ready`、`database=sqlite-connected`、`environment=production`。
- [x] 公网 `/web`：HTTP `303`，跳转到 `/web/login?return_to=%2Fweb`。
- [x] 公网 `/static/auth.css`：HTTP `200`。

## 数据不变量

- 迁移只创建独立关系表和索引/归属触发器，不复制或修改现有资料正文、工作项正文和附件。
- 发布后 SQLite 完整性正常，既有文件对象审计无孤儿对象。
- 新关系表初始为空，符合当前正式环境尚未产生关联发布内容的状态。
- 旧版本应用如需回滚，可忽略新增关系表；不应直接删除迁移表或只恢复 SQLite 主库文件。

## 回滚方案

本次未触发回滚。如发布后出现阻断问题：

1. 停止 qfy-test2 上的 `yuance-api` 写服务。
2. 加载 `/srv/yuance/releases/yuance-api-linux-amd64.before-20260912111252.tar` 并重建容器。
3. 重新执行 Compose 状态、`healthz`、`readyz`、SQLite 完整性和文件对象审计。
4. 只有发生数据损坏或迁移兼容性问题时，才使用备份目录 `/srv/yuance/backend/backups/20260912031258` 成组恢复 SQLite 主库、WAL、SHM。
5. 恢复后重新执行迁移状态和入口验证。新增迁移不提供反向 SQL，不能通过删除表来回滚数据。

## 观察项

- 首个 24 小时继续观察 `healthz`、`readyz`、容器健康状态、应用错误日志、SQLite 磁盘空间和登录失败率。
- 由于未使用真实生产账号，本次没有执行真实用户的链接/取消链接交互；已完成镜像、迁移、数据库、文件审计和公网入口无凭据验证。
- 本次保留一份旧镜像回滚制品，遵守 `YUANCE_KEEP_RELEASE_BACKUPS=1` 的保留策略。
