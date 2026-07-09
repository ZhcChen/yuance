# 元策正式环境部署模板

本目录用于手工 Compose 流程部署元策正式环境。部署方式参考 qfy-sc 的测试环境模板，但元策当前只有一个 `api` 模块，不部署 Redis、PostgreSQL、NATS、Worker 或独立前端。

目录路径里保留 `easy-deploy` 只是历史模板命名；当前正式环境发布不依赖 easy-deploy 平台，只依赖本地构建、SSH/SCP、服务器 `docker load` 和 Docker Compose。

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

推荐直接使用正式发布脚本：

```bash
cd <yuance-repo>
./scripts/deploy-production.sh
```

该脚本会本地构建镜像、上传制品、远程执行 `docker load`、备份 SQLite、迁移、基础 seed、重建容器和健康检查。远程步骤带有 `timeout`，并通过单次 `yuance-api-maintenance-*` 维护容器完成迁移和 seed，避免连续多次 `docker compose run` 造成额外磁盘 IO；同时兼容清理历史 `yuance-api-run-*` 临时容器。

如只想构建镜像 tar，可单独执行：

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
docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
docker compose --env-file .env -f compose.yaml run --rm --no-deps --name yuance-api-maintenance api sh -eu -c '
  ./yuance-api migrate status
  ./yuance-api migrate up
  ./yuance-api seed core
'
docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
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

默认使用 `./scripts/deploy-production.sh`。脚本内部顺序：

1. 确认本地 `main` 工作区干净且与 `origin/main` 一致。
2. 本地构建新的 `linux/amd64` 镜像 tar。
3. 上传 tar 和部署模板到服务器。
4. `docker load -i` 覆盖同名 `yuance-api:latest`。
5. 执行 `backend/scripts/00-backup-sqlite.sh`。
6. 通过单次维护容器执行 `migrate status`、`migrate up`、`seed core`。
7. `docker compose --env-file .env -f compose.yaml up -d --force-recreate --remove-orphans api`。
8. 执行 `backend/scripts/90-healthcheck.sh`。
9. 校验运行容器镜像等于新加载镜像。
10. 按保留策略清理旧 release tar；按需执行 Docker dangling image prune。

可选文件对象盘点仍需单独执行 `backend/scripts/80-files-audit.sh`。

完整命令见 `docs/runbooks/production-deployment.md`。
