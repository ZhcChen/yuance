# 元策正式环境部署模板

本目录用于在 easy-deploy 或手工 Compose 流程中部署元策正式环境。部署方式参考 qfy-sc 的测试环境模板，但元策当前只有一个 `api` 模块，不部署 Redis、PostgreSQL、NATS、Worker 或独立前端。

当前部署机器沿用参考项目测试服务器：

```text
服务器别名：qfy-sc-test
元策环境：production
应用名：yuance
容器名：yuance-api
镜像名：yuance-api:latest
API 宿主机端口：127.0.0.1:33033
正式网关域名：yuance.quanxinfu.com
```

这里的 `qfy-sc-test` 只是服务器别名；对元策来说，本目录就是正式环境模板。

## 部署对象

```text
backend/
  yuance-api 单体服务，提供 /web、/api、静态资源、迁移和 seed CLI。

gateway/
  Caddy 站点片段，反代到宿主机 127.0.0.1:33033。
```

## 本地构建制品

测试服务器是 x86，当前开发机可能是 arm。必须在本地或 CI 使用 Buildx 构建 `linux/amd64` 镜像 tar，服务器只允许 `docker load` 和 `docker compose up`，严禁在服务器执行 `cargo build` 或 `docker build`。

```bash
cd <yuance-repo>
./scripts/build-api-image-amd64.sh
```

默认产物：

```text
dist/yuance-api-linux-amd64.tar
```

如需改镜像名或产物路径：

```bash
YUANCE_API_IMAGE=yuance-api:latest \
YUANCE_API_IMAGE_TAR=dist/yuance-api-linux-amd64.tar \
./scripts/build-api-image-amd64.sh
```

## 上传到服务器

```bash
ssh qfy-sc-test 'mkdir -p /srv/yuance/releases /srv/yuance/easy-deploy/production/backend /srv/yuance/easy-deploy/production/gateway'

scp dist/yuance-api-linux-amd64.tar qfy-sc-test:/srv/yuance/releases/
scp deploy/easy-deploy/production/backend/app.yaml.example qfy-sc-test:/srv/yuance/easy-deploy/production/backend/app.yaml
scp deploy/easy-deploy/production/backend/compose.yaml.example qfy-sc-test:/srv/yuance/easy-deploy/production/backend/compose.yaml
scp deploy/easy-deploy/production/backend/.env.example qfy-sc-test:/srv/yuance/easy-deploy/production/backend/.env.example
scp -r deploy/easy-deploy/production/backend/scripts qfy-sc-test:/srv/yuance/easy-deploy/production/backend/
scp deploy/easy-deploy/production/gateway/Caddyfile.yuance.example qfy-sc-test:/srv/yuance/easy-deploy/production/gateway/Caddyfile.yuance
```

如果使用 easy-deploy 平台创建应用，则把 `backend/app.yaml.example`、`backend/compose.yaml.example`、`backend/.env.example` 和 `backend/scripts/` 同步到平台配置中。

## 服务器首次部署命令

```bash
ssh qfy-sc-test
cd /srv/yuance/easy-deploy/production/backend

docker load -i /srv/yuance/releases/yuance-api-linux-amd64.tar

cp .env.example .env
chmod 600 .env
mkdir -p data backups
```

编辑 `.env`，至少替换：

```text
YUANCE_SESSION_SECRET
YUANCE_SECURITY_MASTER_KEY
```

生成随机值示例：

```bash
openssl rand -base64 48
```

迁移和基础 seed：

```bash
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api migrate status
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api migrate up
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api seed core
```

启动服务：

```bash
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

健康检查：

```bash
curl -fsS http://127.0.0.1:33033/api/healthz
curl -fsS http://127.0.0.1:33033/api/readyz
```

## Caddy 接入

如果服务器的 `/etc/caddy/Caddyfile` 已经包含：

```caddy
import /etc/caddy/Caddyfile.d/*.caddy
```

则执行：

```bash
sudo mkdir -p /etc/caddy/Caddyfile.d
sudo cp /srv/yuance/easy-deploy/production/gateway/Caddyfile.yuance /etc/caddy/Caddyfile.d/yuance.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

如果没有 import 机制，把 `Caddyfile.yuance` 的站点块追加到当前 Caddyfile，再执行 validate 和 reload。

外部验证：

```bash
curl -fsS https://yuance.quanxinfu.com/api/healthz
curl -I https://yuance.quanxinfu.com/web
```

首次访问 `/web` 时，由用户在页面填写第一个超级管理员。正式环境不执行 `seed demo`，也不执行 `seed local-admin`。

## 后续发布顺序

1. 本地构建新的 `linux/amd64` 镜像 tar。
2. 上传 tar 到 `/srv/yuance/releases/`。
3. `docker load -i` 覆盖同名 `yuance-api:latest`。
4. 执行 `backend/scripts/00-backup-sqlite.sh`。
5. 执行 `backend/scripts/10-migrate-status.sh`。
6. 执行 `backend/scripts/20-migrate-up.sh`。
7. 执行 `backend/scripts/30-seed-core.sh`。
8. `docker compose --env-file .env -f compose.yaml up -d`。
9. 执行 `backend/scripts/90-healthcheck.sh`。
10. 按需执行 `backend/scripts/80-files-audit.sh` 做文件对象盘点。

完整命令见 `docs/runbooks/production-deployment.md`。
