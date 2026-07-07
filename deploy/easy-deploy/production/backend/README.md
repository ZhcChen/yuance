# 元策正式后端模板

本目录用于部署 easy-deploy 应用 `yuance`，只包含一个服务：

```text
api：Rust 单体服务，启动命令 ./yuance-api serve
```

该服务同时提供：

- `/web` 用户界面和系统管理界面。
- `/api` JSON 接口。
- `/static/*` 静态资源。
- SQLite migration、core seed、文件维护 CLI。

## 关键边界

- 服务器只运行 Compose，不构建源码镜像。
- Compose 模板不得包含 `build:`。
- SQLite 数据、WAL、SHM、后续本地运行数据挂载在 `./data`。
- 备份文件挂载在 `./backups`。
- OSS 在后台 `/web/system/storage` 动态配置，不写入部署 `.env`。
- 首次超级管理员由用户访问 `/web` 初始化，不执行固定账号 seed。

## 文件说明

```text
app.yaml.example
  easy-deploy 应用元信息。

compose.yaml.example
  Docker Compose 模板；复制到服务器后改名 compose.yaml。

.env.example
  运行环境变量模板；复制到服务器后改名 .env，并填写真实密钥。

scripts/
  发布阶段脚本。既可在服务器 backend 目录执行，也可被部署平台按运行态脚本执行。
```

## 发布脚本顺序

```text
00-backup-sqlite.sh
10-migrate-status.sh
20-migrate-up.sh
30-seed-core.sh
90-healthcheck.sh
80-files-audit.sh        # 可选，健康检查后做对象关系盘点
```

不要在正式环境执行：

```text
seed demo
seed local-admin
```

## 手工部署命令

```bash
cd /srv/yuance/easy-deploy/production/backend

docker load -i /srv/yuance/releases/yuance-api-linux-amd64.tar

cp .env.example .env
chmod 600 .env
mkdir -p data backups

docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api migrate status
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api migrate up
docker compose --env-file .env -f compose.yaml run --rm --no-deps api ./yuance-api seed core
docker compose --env-file .env -f compose.yaml up -d

curl -fsS http://127.0.0.1:33033/api/healthz
curl -fsS http://127.0.0.1:33033/api/readyz
```

## 回滚

SQLite 迁移只支持向前执行。需要回滚时：

1. 停止服务。
2. 恢复发布前 `backups/` 里的 `yuance.sqlite3`、`yuance.sqlite3-wal`、`yuance.sqlite3-shm`。
3. `docker load` 旧镜像 tar。
4. `docker compose --env-file .env -f compose.yaml up -d`。
5. 检查 `/api/healthz` 和 `/api/readyz`。
