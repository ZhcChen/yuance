# 元策正式后端 Compose 模板

当前正式运行位置是 Ubuntu WSL 的 `/srv/yuance/backend`，由 WSL 原生
Docker Engine 承载。仓库目录中的 `easy-deploy` 是历史命名，不代表当前
运行路径或部署平台。

本目录用于手工 Compose 部署 `yuance`，只包含一个服务：

```text
api：Rust 单体服务，启动命令 ./yuance-api serve
```

该服务同时提供：

- `/web` 用户界面和系统管理界面。
- `/api` JSON 接口。
- `/static/*` 静态资源。
- SQLite migration、core seed、文件维护 CLI。

## 关键边界

- `/srv/yuance/backend` 只运行 Compose，不在运行目录内构建；正式远程构建只允许使用独立的 `/srv/yuance/build`。
- Compose 模板不得包含 `build:`。
- SQLite 数据和后续本地运行数据挂载在 `./data`；活动数据库的 WAL/SHM 由 SQLite 在线备份机制读取，不作为独立备份文件。
- 备份文件挂载在 `./backups`。
- OSS 在后台 `/web/system/storage` 动态配置，不写入部署 `.env`。
- 首次超级管理员由用户访问 `/web` 初始化，不执行固定账号 seed。

## 文件说明

```text
app.yaml.example
  应用元信息，保留用于描述部署边界，不代表依赖 easy-deploy 平台。

compose.yaml.example
  Docker Compose 模板；复制到服务器后改名 compose.yaml。

.env.example
  运行环境变量模板；复制到服务器后改名 .env，并填写真实密钥。

scripts/
  发布阶段脚本。存在本地二进制时可直接执行；手工 Compose 发布优先使用仓库根目录的 scripts/deploy-production.sh。
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

正式发布主链路不会逐个调用 `10-migrate-status.sh`、`20-migrate-up.sh`、`30-seed-core.sh` 来创建多个临时容器，而是通过单次维护容器连续执行迁移和基础 seed，降低服务器 Docker overlay 与容器创建带来的磁盘 IO 峰值。

不要在正式环境执行：

```text
seed demo
seed local-admin
```

## 手工部署命令

```bash
cd /srv/yuance/backend

docker load -i /srv/yuance/releases/yuance-api-linux-amd64.tar

cp .env.example .env
chmod 600 .env
mkdir -p data backups

docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
docker compose --env-file .env -f compose.yaml run --rm --no-deps --name yuance-api-maintenance api sh -eu -c '
  ./yuance-api migrate status
  ./yuance-api migrate up
  ./yuance-api seed core
'
docker rm -f yuance-api-maintenance >/dev/null 2>&1 || true
docker compose --env-file .env -f compose.yaml up -d

curl -fsS http://127.0.0.1:33033/api/healthz
curl -fsS http://127.0.0.1:33033/api/readyz
```

## 回滚

SQLite 迁移只支持向前执行。需要回滚时：

1. 停止服务。
2. 从 `backups/<时间戳>.<随机后缀>/manifest.txt` 确认数据库快照和文件主密钥来源。
3. 恢复同一备份目录中的 `yuance.sqlite3`；删除当前数据库留下的 `data/yuance.sqlite3-wal` 和 `data/yuance.sqlite3-shm`。
4. 若 manifest 的 `file_master_key_source=data-file`，将备份中的 `secrets/file_master_key` 恢复到 `data/secrets/file_master_key` 并执行 `chmod 600 data/secrets/file_master_key`；同时确认 `.env` 中 `YUANCE_FILE_MASTER_KEY` 为空且调用 Compose 的 shell 没有提供非空值覆盖。若标记 `environment`，从受控密钥配置恢复相同的 `YUANCE_FILE_MASTER_KEY`，该值不会放入普通备份。
5. 执行 `sqlite3 data/yuance.sqlite3 'PRAGMA integrity_check;'` 并确认输出 `ok`。
6. `docker load` 旧镜像 tar 并启动服务；随后检查迁移状态、文件对象关系、`/api/healthz`、`/api/readyz` 和加密附件读取。

不含 `manifest.txt` 的历史备份不能用于推断密钥来源。需先从受控备份确认数据库快照与文件主密钥匹配；无法确认时不要恢复覆盖。

备份脚本使用 SQLite `.backup` 生成一致的单文件快照，不复制活动数据库的 WAL/SHM。目标机需安装 `sqlite3`；快照完整性校验失败或自动文件主密钥缺失时，脚本会失败并清理不完整备份。
