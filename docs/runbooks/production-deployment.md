---
title: 元策正式环境部署运行手册
type: runbook
status: active
date: 2026-08-02
---

# 元策正式环境部署运行手册

元策正式环境运行在本机 Ubuntu WSL，由 WSL 原生 Docker Engine 承载。
公网服务器 `qfy-sc-test` 只保留 Caddy、FRPS 和已停止的旧环境作为冷回滚。

## 当前拓扑

```text
yuance.quanxinfu.com
-> qfy-sc-test Caddy :443
-> FRPS 127.0.0.1:40000
-> WSL FRPC
-> WSL Docker 127.0.0.1:33033
-> yuance-api
```

运行口径：

```text
WSL 发行版：Ubuntu-24.04
运行目录：/srv/yuance/backend
镜像目录：/srv/yuance/releases
迁移包目录：/srv/yuance/incoming
Compose 服务：api
容器：yuance-api
镜像：yuance-api:latest
SQLite：/srv/yuance/backend/data/yuance.sqlite3
FRP Web：http://127.0.0.1:8067
域名：yuance.quanxinfu.com
```

SQLite 数据必须位于 WSL Linux 文件系统，不得迁到 `/mnt/c`。`.env` 必须
保持 `600`，并保持 `YUANCE_SECURITY_MASTER_KEY` 不变，否则已有 OSS Secret
无法解密。

## 运行边界

- 只部署 `api` 一个 Rust 单体服务。
- SQLite 是唯一数据库。
- 不部署 Redis；缓存使用进程内内存。
- 不部署 PostgreSQL、NATS、Worker、独立前端或独立后台。
- `/web`、`/api`、静态资源、迁移和 seed 都由 `yuance-api` 二进制提供。
- OSS 不写入部署环境变量，部署后由超级管理员在 `/web/system/storage` 动态配置。
- 必须保持 `YUANCE_SECURITY_MASTER_KEY` 稳定，否则已保存的 OSS Secret 无法解密。
- 文档预览已改为站内离线处理；PDF、TXT、LOG、MD、JSON、XML、YAML、YML、CSV、XLS、XLSX、ODS、DOCX、PPTX 走稳定纯前端预览，DOC、PPT 走 legacy 纯前端预览。

## 自动启动

Windows 计划任务 `WSL-Ubuntu-KeepAlive` 启动 `Ubuntu-24.04`；WSL systemd
随后启动 Docker、FRPC 和 FRP Web。`yuance-api` 使用 Compose
`restart: unless-stopped`，Docker 恢复后自动启动。

检查命令：

```bash
systemctl is-enabled docker frpc frp-web
systemctl is-active docker frpc frp-web
docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' yuance-api
```

## 构建镜像

在 WSL 内从仓库执行：

```bash
cd /mnt/c/Users/Administrator/code/yuance
./scripts/build-api-image-amd64.sh
```

服务器和 `/srv/yuance` 运行目录内禁止执行 `cargo build` 或
`docker build`。

## 一键发布

默认模式是 `local-wsl`：

```bash
cd /mnt/c/Users/Administrator/code/yuance
./scripts/deploy-production.sh
```

脚本要求 `main` 工作区干净并与 `origin/main` 一致，使用 WSL 原生
`/usr/bin/docker`，然后执行：

1. 构建并校验 `linux/amd64` 镜像 tar。
2. 备份 `/srv/yuance/releases` 中当前镜像 tar。
3. 同步 Compose、app 元数据和运维脚本，但不覆盖 `.env` 或数据。
4. 加载镜像并备份 SQLite 主库、WAL、SHM。
5. 在单次维护容器内执行 `migrate status`、`migrate up`、`seed core`。
6. 重建 `yuance-api`，检查 health、ready、文件对象审计和镜像 ID。

可选参数：

```bash
YUANCE_SKIP_LOCAL_BUILD=1 ./scripts/deploy-production.sh
YUANCE_KEEP_RELEASE_BACKUPS=2 ./scripts/deploy-production.sh
YUANCE_PRUNE_DANGLING_IMAGES=1 ./scripts/deploy-production.sh
```

保留的旧远程流程只能显式调用，不会默认回退到旧服务器：

```bash
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_HOST=<明确目标主机> \
./scripts/deploy-production.sh
```

`local-wsl` 模式设置 `YUANCE_DEPLOY_HOST` 会被拒绝；`remote` 模式缺少目标
主机也会被拒绝。

## 手工检查

```bash
cd /srv/yuance/backend

sqlite3 data/yuance.sqlite3 'PRAGMA integrity_check;'
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api migrate status
./scripts/80-files-audit.sh
./scripts/90-healthcheck.sh
```

运行说明：

- 当前部署不再依赖 `LibreOffice`、`soffice`、ONLYOFFICE 或服务端文档转换缓存。
- PDF、TXT、LOG、MD、JSON、XML、YAML、YML、CSV、XLS、XLSX、ODS、DOCX、PPTX 统一走站内前端离线预览。
- DOC、PPT 也走站内前端 legacy 预览链路，不需要额外环境变量开关；复杂版式兼容性有限，PPT 当前运行时会带可见水印。
- 文档预览页只负责生成临时可访问地址，实际解析与渲染全部由浏览器完成。
- 如果当前仍使用测试内存存储，文档预览页会自动回退到同源读取，不依赖外部文档服务。

正式环境 `.env` 必须保持：

```text
YUANCE_ENV=production
YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3
YUANCE_DATA_DIR=/data
YUANCE_API_BIND_IP=127.0.0.1
YUANCE_API_PORT=33033
```

公网检查：

```bash
curl -fsS https://yuance.quanxinfu.com/api/healthz
curl -fsS https://yuance.quanxinfu.com/api/readyz
curl -I https://yuance.quanxinfu.com/web
curl -I https://yuance.quanxinfu.com/static/app.css
```

## FRP 与 Caddy

Yuance 路由由 FRP Web 管理：

```text
route id：6b1c1c6f-59b4-486d-9e00-a1dd5546ae4d
名称：yuance
域名：yuance.quanxinfu.com
本地端口：33033
远端端口：40000
```

WSL 受管 FRPC 片段位于 `/etc/frp/conf.d/frp-web/*.toml`。主配置必须同时
加载顶层人工片段与该受管子目录：

```toml
includes = ["/etc/frp/conf.d/*.toml", "/etc/frp/conf.d/frp-web/*.toml"]
```

服务器受管 Caddy 片段位于 `/etc/caddy/Caddyfile.d/frp-web/*.caddy`。
原 `/etc/caddy/Caddyfile.d/yuance.caddy` 已移出加载范围并保留备份。
FRPS 的代理端口只监听 `127.0.0.1`，禁止向公网开放 `40000-40999`。

## 数据备份

发布前执行：

```bash
cd /srv/yuance/backend
./scripts/00-backup-sqlite.sh
```

SQLite 主库、`-wal`、`-shm` 是一个恢复单元。复制前必须停止唯一写入进程，
恢复后必须重新执行 integrity、migration status 和文件对象审计。

## 文件维护

对象关系盘点：

```bash
cd /srv/yuance/backend
./scripts/80-files-audit.sh
YUANCE_INCLUDE_DELETED_FILES=1 ./scripts/80-files-audit.sh
```

pending 清理先 dry-run：

```bash
docker compose --env-file .env -f compose.yaml exec -T api \
  ./yuance-api files cleanup-pending --older-than-hours 24 --dry-run
```

确认后去掉 `--dry-run`。当前命令只做数据库软删除，不删除 OSS 物理对象。

## 回滚到公网旧环境

观察期内不得删除公网服务器的旧容器、旧数据、镜像、迁移包或 Caddy 备份。
回滚遵循单写原则：

1. 在 WSL 停止 `yuance-api`。
2. 在 FRP Web 停用 Yuance 路由，或把受管 FRPC/Caddy 片段移出加载范围。
3. 恢复服务器旧 `yuance.caddy`，执行 Caddy validate/reload。
4. 在 `qfy-sc-test` 启动旧 `yuance-api`，不执行 migrate 或 seed。
5. 验证 health、ready、登录、项目数据和 OSS 文件读取。

关键命令：

```bash
# WSL
cd /srv/yuance/backend
docker compose --env-file .env -f compose.yaml stop api

# qfy-sc-test
cd /srv/yuance/easy-deploy/production/backend
docker compose --env-file .env -f compose.yaml up -d api
```

如只回滚 WSL 应用版本，加载 `/srv/yuance/releases` 中上一版 tar 后重建
容器。若还需回滚数据库，必须先停服务，再成组恢复主库、WAL 和 SHM。

## 禁止事项

- 禁止提交、打印或记录真实 `.env`、OSS AccessKey、FRP token。
- 禁止在正式环境执行 `seed demo` 或 `seed local-admin`。
- 禁止修改已经发布的 SQL migration。
- 禁止新旧两端同时提供写服务。
- 禁止把 `qfy-sc-test` 作为部署脚本的隐式默认目标。
- 禁止手工创建第二个同域名 Caddy 站点。
