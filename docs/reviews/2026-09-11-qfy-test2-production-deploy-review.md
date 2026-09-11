# qfy-test2 正式环境部署复核

## 标题信息

- 主题：编译与镜像构建链优化版本发布到 qfy-test2
- 关联提交：`541774f`、`3a91735`
- 部署目标：`qfy-test2`（内网 SSH 目标）
- 运行目录：`qfy-test2:/srv/yuance/backend`
- 日期：2026-09-11

## Go/No-Go 结果

- 结论：Go，发布完成。
- 发布方式：`YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_HOST=qfy-test2 ./scripts/deploy-production.sh`
- qfy-test2 网络与运行环境：SSH、Docker、Compose、生产 `.env` 和 `/srv/yuance/backend` 均可用。
- 未在 qfy-test2 或 `/srv/yuance` 执行源码编译、镜像构建或依赖安装。

## 发布前检查

- [x] `main` 已与 `origin/main` 同步。
- [x] 前端检查通过：Web、frontend workspace、Desktop renderer 检查及测试均通过。
- [x] 镜像目标平台为 `linux/amd64`。
- [x] 本地镜像 tar 已生成，SHA256 为 `fee8568b761a6caa76ef4d101d013f670b773f200f15f8db6820d72af7d3b08d`。
- [x] 目标机现有容器发布前健康：`yuance-api` 为 `healthy`。
- [x] 发布脚本自动备份了目标机当前镜像和 SQLite 主库、WAL、SHM。

## 发布执行证据

- 远端镜像 tar SHA256 校验通过，与本地一致。
- 目标机镜像加载成功：`yuance-api:latest`。
- SQLite 发布前备份目录：`/srv/yuance/backend/backups/20260911065225`。
- 旧镜像回滚制品：`/srv/yuance/releases/yuance-api-linux-amd64.before-20260911145219.tar`。
- 迁移状态：`applied=33 total=33`，迁移执行成功且无待应用迁移。
- `seed core`：执行成功。
- `yuance-api`：重建并启动成功，未执行 dangling image 清理。

## 发布后验证

- [x] Compose 状态：`yuance-api` 为 `running`，健康状态为 `healthy`。
- [x] SQLite `PRAGMA integrity_check;`：返回 `ok`。
- [x] 文件对象审计：`total=140`、`attached=140`、`orphan=0`、`pending_orphan=0`、`uploaded_orphan=0`。
- [x] 公网 `https://yuance.quanxinfu.com/api/healthz`：返回 `status=ok`。
- [x] 公网 `https://yuance.quanxinfu.com/api/readyz`：返回 `status=ready`、`database=sqlite-connected`、`environment=production`。
- [x] 公网 `/web`：返回 `303` 并跳转到 `/web/login`，符合未登录访问行为。
- [x] 运行容器镜像摘要：`sha256:42109f78c96d8185ec5925f5d34efaee9e6af492a16d756b9b88a0766663a6fb`。

## 回滚方案

本次未触发回滚。若发布后出现阻断问题：

1. 停止 `qfy-test2` 上的 `yuance-api` 写服务。
2. 加载 `/srv/yuance/releases/yuance-api-linux-amd64.before-20260911145219.tar` 并重建容器。
3. 如需恢复数据库，成组恢复备份目录中的 SQLite 主库、WAL、SHM；不要只恢复主库。
4. 重新执行 `PRAGMA integrity_check`、migration status、健康检查和文件对象审计。
5. 只有确认应用和数据均正常后，才恢复对外写入。

SQLite migration 只支持向前执行；本次迁移状态已经是 `33/33`，未产生需要回退的新增迁移。

## 观察项

- 继续观察 `healthz`、`readyz`、容器健康状态、应用错误日志和 SQLite 磁盘空间。
- 继续保留本次旧镜像 tar 作为回滚制品，遵守 `YUANCE_KEEP_RELEASE_BACKUPS` 的保留策略。
- `qfy-test` 仅作为显式备用目标，不作为本次发布目标或隐式回退目标。
