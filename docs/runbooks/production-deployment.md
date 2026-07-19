---
title: 元策正式环境部署运行手册
type: runbook
status: active
date: 2026-07-07
---

# 元策正式环境部署运行手册

本文记录元策正式环境的完整部署命令。部署方式参考 qfy-sc 测试环境，但元策当前只部署一个 `api` 模块。

## 环境口径

```text
仓库：yuance
参考项目：qfy-sc
部署服务器别名：qfy-sc-test
元策环境：production
Compose 应用名：yuance
Compose name：yuance
服务名：api
容器名：yuance-api
镜像名：yuance-api:latest
镜像目标架构：linux/amd64
镜像 tar：dist/yuance-api-linux-amd64.tar
API 端口：127.0.0.1:33033
正式域名：yuance.quanxinfu.com
```

`qfy-sc-test` 是服务器别名，不代表元策环境是测试环境。

当前服务器目录仍沿用 `/srv/yuance/easy-deploy/production/*` 命名，原因是首次部署已经在该目录保存 SQLite 数据和 Compose 文件；这只是目录名，不代表依赖 easy-deploy 平台。正式发布流程只依赖本地构建、SSH/SCP、`docker load` 和服务器上的 Docker Compose。

## 架构边界

- 只部署 `api` 一个 Rust 单体服务。
- SQLite 是唯一数据库。
- 不部署 Redis；缓存使用进程内内存。
- 不部署 PostgreSQL、NATS、Worker、独立前端或独立后台。
- `/web`、`/api`、静态资源、迁移和 seed 都由 `yuance-api` 二进制提供。
- OSS 不写入部署环境变量，部署后由超级管理员在 `/web/system/storage` 动态配置。
- 必须保持 `YUANCE_SECURITY_MASTER_KEY` 稳定，否则已保存的 OSS Secret 无法解密。
- 文档预览已改为站内离线处理；PDF、TXT、LOG、MD、JSON、XML、YAML、CSV 可直接预览，Office / ODF 文档需要服务器安装 `libreoffice` 或 `soffice`。

## 本地构建镜像 tar

服务器禁止源码编译和镜像构建。本地或 CI 执行：

```bash
cd <yuance-repo>
./scripts/build-api-image-amd64.sh
```

可选覆盖：

```bash
YUANCE_API_IMAGE=yuance-api:latest \
YUANCE_API_IMAGE_TAR=dist/yuance-api-linux-amd64.tar \
YUANCE_API_PLATFORM=linux/amd64 \
./scripts/build-api-image-amd64.sh
```

arm 开发机可以通过 Docker Buildx 构建 `linux/amd64`。这会使用跨架构构建，Rust 编译会比原生慢。

## 一键发布脚本

后续说“部署正式环境”时，默认执行本地脚本：

```bash
cd <yuance-repo>
./scripts/deploy-production.sh
```

脚本保证：

- 本地工作区必须在 `main`、干净且与 `origin/main` 一致。
- 镜像只在本地构建为 `linux/amd64`，服务器不执行 `cargo build` 或 `docker build`。
- 上传前备份服务器当前镜像 tar。
- 远程步骤使用 `timeout`，并通过单次 `yuance-api-maintenance-*` 维护容器完成 `migrate status`、`migrate up`、`seed core`，避免连续多次 `docker compose run` 造成额外磁盘 IO。
- 开始和退出时清理 `yuance-api-maintenance-*` 以及历史 `yuance-api-run-*` 临时容器，降低 SSH 中断后的残留风险。
- 发布后校验 `yuance-api` 运行镜像等于新加载的 `yuance-api:latest`，并检查 `/api/healthz` 与 `/api/readyz`。
- 默认保留最近 1 个旧 release tar 作为回滚制品。

可选参数：

```bash
YUANCE_SKIP_LOCAL_BUILD=1 ./scripts/deploy-production.sh
YUANCE_KEEP_RELEASE_BACKUPS=2 ./scripts/deploy-production.sh
YUANCE_PRUNE_DANGLING_IMAGES=1 ./scripts/deploy-production.sh
```

其中 `YUANCE_PRUNE_DANGLING_IMAGES=1` 会在发布成功后执行 `docker image prune -f`，只清理未被容器使用、没有标签的镜像；该操作可能造成短时间磁盘 IO 升高，默认不启用。

## 上传模板和制品

以下命令是手工 Compose 部署目录同步；目录名中出现 `easy-deploy` 只是历史路径，不需要也不会调用 easy-deploy 平台。

```bash
ssh qfy-sc-test 'mkdir -p /srv/yuance/releases /srv/yuance/easy-deploy/production/backend /srv/yuance/easy-deploy/production/gateway'

scp dist/yuance-api-linux-amd64.tar qfy-sc-test:/srv/yuance/releases/
scp deploy/easy-deploy/production/backend/app.yaml.example qfy-sc-test:/srv/yuance/easy-deploy/production/backend/app.yaml
scp deploy/easy-deploy/production/backend/compose.yaml.example qfy-sc-test:/srv/yuance/easy-deploy/production/backend/compose.yaml
scp deploy/easy-deploy/production/backend/.env.example qfy-sc-test:/srv/yuance/easy-deploy/production/backend/.env.example
scp -r deploy/easy-deploy/production/backend/scripts qfy-sc-test:/srv/yuance/easy-deploy/production/backend/
scp deploy/easy-deploy/production/gateway/Caddyfile.yuance.example qfy-sc-test:/srv/yuance/easy-deploy/production/gateway/Caddyfile.yuance
```

## 服务器初始化

```bash
ssh qfy-sc-test
cd /srv/yuance/easy-deploy/production/backend

docker load -i /srv/yuance/releases/yuance-api-linux-amd64.tar

cp .env.example .env
chmod 600 .env
mkdir -p data backups
```

编辑 `.env`，至少填写：

```text
YUANCE_SESSION_SECRET
YUANCE_SECURITY_MASTER_KEY
```

如需启用 Office / OpenDocument 离线预览，请确保正式机已安装以下任一命令：

- `libreoffice`
- `soffice`

验证方式：

```bash
libreoffice --version
# 或
soffice --version
```

说明：

- PDF、TXT、LOG、MD、JSON、XML、YAML、CSV 不依赖 LibreOffice。
- `doc/docx/odt/rtf/xls/xlsx/ods/ppt/pptx/odp` 会在服务端临时转换为 PDF 后再站内预览。
- 转换后的 PDF 会缓存到 `data/preview-cache/`，重复预览同一附件不会再次转换。
- 如果服务器未安装 LibreOffice，相关 Office 文档会在预览页内显示友好错误提示，但原文件下载不受影响。
- 如果当前仍使用测试内存存储，文档预览页同样可以直接读取对象内容，不再依赖外部文档服务。

正式环境 `.env` 必须保持：

```text
YUANCE_ENV=production
YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3
YUANCE_DATA_DIR=/data
YUANCE_API_BIND_IP=127.0.0.1
YUANCE_API_PORT=33033
```

## 首次发布

```bash
cd /srv/yuance/easy-deploy/production/backend

docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
docker compose --env-file .env -f compose.yaml run --rm --no-deps --name yuance-api-maintenance api sh -eu -c '
  ./yuance-api migrate status
  ./yuance-api migrate up
  ./yuance-api seed core
'
docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps

curl -fsS http://127.0.0.1:33033/api/healthz
curl -fsS http://127.0.0.1:33033/api/readyz
```

首次访问：

```text
https://yuance.quanxinfu.com/web
```

页面会进入首个超级管理员初始化流程，由用户填写账号密码。

## Caddy 配置

如果服务器 Caddy 主配置支持 `Caddyfile.d`：

```bash
sudo mkdir -p /etc/caddy/Caddyfile.d
sudo cp /srv/yuance/easy-deploy/production/gateway/Caddyfile.yuance /etc/caddy/Caddyfile.d/yuance.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

如果不支持，把以下站点块追加到 `/etc/caddy/Caddyfile`：

```caddy
yuance.quanxinfu.com {
  encode zstd gzip

  reverse_proxy 127.0.0.1:33033
}
```

外部验证：

```bash
curl -fsS https://yuance.quanxinfu.com/api/healthz
curl -I https://yuance.quanxinfu.com/web
```

## 后续发布

本地构建并上传新 tar 后，在服务器执行：

```bash
ssh qfy-sc-test
cd /srv/yuance/easy-deploy/production/backend

docker load -i /srv/yuance/releases/yuance-api-linux-amd64.tar

./scripts/00-backup-sqlite.sh
docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
docker compose --env-file .env -f compose.yaml run --rm --no-deps --name yuance-api-maintenance api sh -eu -c '
  ./yuance-api migrate status
  ./yuance-api migrate up
  ./yuance-api seed core
'
docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true

docker compose --env-file .env -f compose.yaml up -d
./scripts/90-healthcheck.sh
```

可选文件对象盘点：

```bash
./scripts/80-files-audit.sh
```

包含已删除对象：

```bash
YUANCE_INCLUDE_DELETED_FILES=1 ./scripts/80-files-audit.sh
```

## 文件 pending 清理

先 dry-run：

```bash
cd /srv/yuance/easy-deploy/production/backend
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-pending --older-than-hours 24 --dry-run
```

确认后执行：

```bash
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-pending --older-than-hours 24
```

如需每天凌晨执行，可在服务器 crontab 中调用上述命令。当前清理只做数据库软删除，不删除 OSS 物理对象。

## OSS 上线后配置

服务部署完成并初始化管理员后：

1. 登录 `/web`。
2. 进入 `/web/system/storage`。
3. 填写阿里云 OSS Endpoint、Region、Bucket、AccessKey ID、AccessKey Secret。
4. 保存并激活。
5. 点击“检测桶状态”。
6. 如提示需要初始化，点击“初始化桶”。

点击“初始化桶”会按需创建私有 Bucket、补齐浏览器直传 CORS，并写入初始化标记。

## 禁止事项

- 禁止在服务器执行 `cargo build`。
- 禁止在服务器执行 `docker build`。
- 禁止提交或上传真实 `.env` 到仓库。
- 禁止在正式环境执行 `seed demo`。
- 禁止在正式环境执行 `seed local-admin`。
- 禁止更换 `YUANCE_SECURITY_MASTER_KEY` 后继续使用旧加密配置。
- 禁止修改已经发布过的 SQL migration 文件。

## 回滚

如果发布后需要回滚应用版本且没有执行破坏性数据修复：

```bash
cd /srv/yuance/easy-deploy/production/backend

docker compose --env-file .env -f compose.yaml stop api
docker load -i /srv/yuance/releases/<上一版镜像>.tar
docker compose --env-file .env -f compose.yaml up -d
./scripts/90-healthcheck.sh
```

如果迁移后需要回滚数据库：

1. 停止服务。
2. 从 `backups/<时间戳>/` 恢复 `yuance.sqlite3`、`yuance.sqlite3-wal`、`yuance.sqlite3-shm` 到 `data/`。
3. 加载上一版镜像。
4. 启动服务。
5. 检查 `/api/readyz`、登录页、项目列表和系统管理入口。

SQLite 迁移当前只支持向前执行；数据库回滚必须依赖发布前备份。
