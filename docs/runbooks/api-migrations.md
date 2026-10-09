---
title: API 迁移与 seed 运行手册
type: runbook
status: active
date: 2026-06-26
---

# API 迁移与 seed 运行手册

## 适用范围

本文档适用于 `api` 模块的 SQLite 数据库迁移、基础数据 seed、演示数据 seed 和开发测试管理员 seed。

## 基本原则

- 生产部署必须显式执行迁移，不依赖 HTTP 服务启动时自动迁移。
- seed 分为可生产执行的 `core` 和仅开发/测试执行的 `demo`、`local-admin`。
- 迁移文件只追加，不修改已发布迁移。
- `migrate status`、`migrate up` 和 `migrate up-to` 会先校验迁移历史表，发现失败迁移、checksum 漂移或数据库存在当前二进制未知迁移版本时直接失败。
- 涉及生产数据前先运行 `scripts/00-backup-sqlite.sh` 生成 SQLite 在线一致快照；不要在数据库运行期间逐个复制主库、WAL 和 SHM。

## 常用命令

```bash
make api-migrate-status
make api-migrate-up
make api-seed-core
make api-run
```

创建迁移占位：

```bash
make api-migrate-create NAME=create_xxx_tables
```

开发演示库：

```bash
YUANCE_ENV=development make api-seed-demo
```

开发固定超管：

```bash
YUANCE_ENV=development make api-seed-local-admin
```

默认开发账号：

```text
username: yuance_admin
password: Yuance@2026Dev!
```

## 生产发布步骤

1. 确认生产服务配置及数据目录保持稳定，并确认目标机安装 `sqlite3`。
2. 使用 `./scripts/00-backup-sqlite.sh` 生成并校验单文件快照。
3. 确认生产环境变量：
   - `YUANCE_ENV=production`
   - `YUANCE_DATABASE_URL=sqlite://...`
   - `YUANCE_SECURITY_MASTER_KEY=<稳定强随机值>`
4. 在后端运行目录使用单次维护容器执行迁移，不在服务器源码目录运行 `cargo run`：

```bash
cd /srv/yuance/backend
docker compose --env-file .env -f compose.yaml run --rm --no-deps \
  --name yuance-api-maintenance api sh -eu -c '
    ./yuance-api migrate status
    ./yuance-api migrate up
    ./yuance-api seed core
  '
```

`migrate status` 输出 `migration state: ok` 表示当前 `_sqlx_migrations` 与二进制内置迁移一致；若失败，先处理错误中指出的迁移版本，不要继续执行 `up`。

5. 启动服务并检查：

```bash
docker compose --env-file .env -f compose.yaml up -d --force-recreate --remove-orphans api
curl -fsS http://127.0.0.1:33033/api/healthz
curl -fsS http://127.0.0.1:33033/api/readyz
```

## 禁止事项

- 生产环境禁止执行 `seed demo`。
- 生产环境禁止执行 `seed local-admin`。
- 禁止把 `YUANCE_SECURITY_MASTER_KEY` 改成新值后继续使用旧密文配置。
- 禁止手动改 `sqlx` 迁移历史表绕过失败迁移。
- 禁止修改已经应用到任何环境的迁移文件；如果 `migrate status` 报 checksum 不一致，必须恢复对应迁移文件或按人工数据修复流程处理。

## 回滚策略

SQLite 迁移当前只支持向前执行。需要回滚时：

1. 停止服务。
2. 恢复备份目录中的 `yuance.sqlite3` 单文件快照，并删除当前 `data/yuance.sqlite3-wal`、`data/yuance.sqlite3-shm`。
3. 若 `manifest.txt` 标记 `data-file`，恢复同一份 `secrets/file_master_key` 到 `data/secrets/file_master_key`，执行 `chmod 600 data/secrets/file_master_key`，并确认 `.env` 中 `YUANCE_FILE_MASTER_KEY` 为空且调用 Compose 的 shell 没有提供非空值覆盖；若标记 `environment`，从受控配置恢复同一 `YUANCE_FILE_MASTER_KEY`。
4. 执行 `sqlite3 data/yuance.sqlite3 'PRAGMA integrity_check;'` 并确认输出 `ok`。
5. 回退应用二进制版本并启动服务；随后检查 `/api/readyz`、迁移状态、文件对象关系和加密附件读取。

没有 `manifest.txt` 的历史备份不包含可靠的密钥来源标记。必须从独立受控副本确认数据库和文件主密钥属于同一备份时点；不能确认时不要覆盖当前数据。恢复后需实际读取加密附件验证，而不只依赖 SQLite 完整性检查。

## 文件维护

附件直传可能因为用户关闭页面或上传失败留下长期 `pending` 文件对象。文件维护命令见：

```text
docs/runbooks/file-maintenance.md
```

完整服务器部署流程见：

```text
docs/runbooks/production-deployment.md
```
