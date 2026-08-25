# 时间管理正式环境部署 Review

## 结论

时间管理 API 与前端已部署到正式环境，部署通过。

- 发布版本：`20260825095528`（镜像 tar `1e6dcad...910693b`）
- 发布源 HEAD：`3370ce1`
- 线上入口：`https://yuance.quanxinfu.com`

## 部署前修复

- `frontend/packages/ui/src/time-allocation-gantt.jsx` 原先直接访问 `document`，触发共享包边界检查失败；
- 已改为 `track.ownerDocument.createElement('div')`，并提交 `3370ce1`；
- 本地验证：`npm --prefix frontend run check:boundaries`、`npm --prefix frontend/packages/ui run check`（69 项）均通过。

## 已执行验证

### 构建与迁移

- 正式 WSL 通过 `scripts/build-api-image-amd64.sh` 构建 amd64 镜像并生成离线 tar；
- `docker load` 成功，镜像 SHA256 校验一致；
- SQLite 备份完成：`/srv/yuance/backend/backups/20260825021527`；
- 维护容器执行 `migrate status` / `migrate up` / `seed core` 成功：
  - `migrations: applied=31 total=31`，状态 `ok`
  - 包含时间管理迁移 `202608240001 create project time allocations`
  - `core seed applied`
- `docker compose up -d --force-recreate --remove-orphans api` 成功，容器健康。

### 线上接口

```text
GET /api/healthz                                -> 200
GET /api/readyz                                 -> 200
GET /api/v1/time-management/overview            -> 401（路由已存在，未登录）
GET /api/v1/time-management/members             -> 401（路由已存在，未登录）
GET /api/v1/time-management/changes             -> 401（路由已存在，未登录）
GET /version.json                               -> {"version":"20260825095528"}
```

时间管理相关接口不再返回 404，页面不应再提示“当前服务端未提供时间管理接口”。

## 部署过程中的问题与处理

首次部署在 `docker compose run` 维护容器阶段卡住：Docker Compose v5.3.1 在分配 TTY 时 `run` 输出到
“Container Created”后不再推进，进程持续占用 CPU，且未创建实际维护容器。

处理方式：

1. 终止卡住的部署进程，确认无残留维护容器；
2. 改用无 TTY 方式重新执行 `./scripts/deploy-production.sh`（等价于 Compose `run -T`），
   并设置 `YUANCE_SKIP_LOCAL_BUILD=1` 复用已构建镜像 tar；
3. 部署脚本后续步骤全部通过。

建议后续在部署运行手册中记录：正式 WSL 上执行该脚本不要使用 `ssh -tt`，避免触发 Compose TTY 挂起。

## 回归与风险

- 未发现明显回归；`healthz` / `readyz` 正常，文件审计 `attached=95 orphan=0`。
- 回滚保护：WSL 保留了 `yuance-api-linux-amd64.before-20260825101527.tar`，SQLite 有部署前备份。
- 仍需关注：线上时间管理接口尚未用真实账号做写入验证，建议用户在页面登录后检查排期读写、记录与回退。

## 结论

- 结论：通过
- 下一步：用户可在线上页面验证时间管理功能；后续部署避免 TTY 调用 Compose `run`。
