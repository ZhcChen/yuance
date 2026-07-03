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
- 涉及生产数据前先备份 SQLite 文件及 WAL/SHM 文件。

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

1. 停止写流量或进入维护窗口。
2. 备份 SQLite 数据文件、`-wal` 和 `-shm` 文件。
3. 设置生产环境变量：
   - `YUANCE_ENV=production`
   - `YUANCE_DATABASE_URL=sqlite://...`
   - `YUANCE_SECURITY_MASTER_KEY=<稳定强随机值>`
4. 执行：

```bash
cargo run -p yuance-api -- migrate status
cargo run -p yuance-api -- migrate up
cargo run -p yuance-api -- seed core
```

`migrate status` 输出 `migration state: ok` 表示当前 `_sqlx_migrations` 与二进制内置迁移一致；若失败，先处理错误中指出的迁移版本，不要继续执行 `up`。

5. 启动服务并检查：

```bash
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
2. 恢复发布前备份的数据文件、WAL 和 SHM。
3. 回退应用二进制版本。
4. 启动后检查 `/api/readyz` 和关键页面。

## 文件维护

附件直传可能因为用户关闭页面或上传失败留下长期 `pending` 文件对象。文件维护命令见：

```text
docs/runbooks/file-maintenance.md
```
