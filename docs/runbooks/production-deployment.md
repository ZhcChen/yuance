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
easy-deploy 应用名：yuance
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

## 架构边界

- 只部署 `api` 一个 Rust 单体服务。
- SQLite 是唯一数据库。
- 不部署 Redis；缓存使用进程内内存。
- 不部署 PostgreSQL、NATS、Worker、独立前端或独立后台。
- `/web`、`/api`、静态资源、迁移和 seed 都由 `yuance-api` 二进制提供。
- OSS 不写入部署环境变量，部署后由超级管理员在 `/web/system/storage` 动态配置。
- 必须保持 `YUANCE_SECURITY_MASTER_KEY` 稳定，否则已保存的 OSS Secret 无法解密。

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

## 上传模板和制品

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

生成随机值：

```bash
openssl rand -base64 48
```

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

docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api migrate status
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api migrate up
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api seed core
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
./scripts/10-migrate-status.sh
./scripts/20-migrate-up.sh
./scripts/30-seed-core.sh

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
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api files cleanup-pending --older-than-hours 24 --dry-run
```

确认后执行：

```bash
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api files cleanup-pending --older-than-hours 24
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

元策不会自动创建阿里云 Bucket。Bucket 不存在时，需要先在阿里云控制台创建私有 Bucket。

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
