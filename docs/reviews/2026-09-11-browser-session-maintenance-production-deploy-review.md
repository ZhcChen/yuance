---
title: 浏览器会话与更新维护页正式部署复核
type: review
status: completed
date: 2026-09-11
---

# 浏览器会话与更新维护页正式部署复核

## 结论

通过。本次 `4125dd8` 已按正式环境运行手册发布到内网目标 `qfy-test2`，
数据库迁移、容器健康检查、公网入口检查和文件对象审计均通过。公网 Nginx
已启用 502、503、504 更新维护页。

## Go/No-Go

- [x] 发布前 `main` 与 `origin/main` 一致；用户保留的未跟踪计划文档未被修改。
- [x] 发布机构建和前端检查通过，镜像目标平台为 `linux/amd64`。
- [x] 发布前 SQLite `PRAGMA integrity_check` 返回 `ok`。
- [x] 发布前容器为 `healthy`，生产 `.env` 权限为 `600`。
- [x] 发布脚本通过 `YUANCE_DEPLOY_MODE=remote` 和 `YUANCE_DEPLOY_HOST=qfy-test2` 执行。

## 发布证据

- 镜像发布版本：`20260911162124`。
- 镜像 tar SHA256：`c2709fb82aa8e273dfc94ebdd4382e0801627499898f63184a3cf23bba8130dd`。
- 远端镜像 tar SHA256 与本地一致。
- SQLite 发布前备份：`qfy-test2:/srv/yuance/backend/backups/20260911082320`。
- 旧镜像回滚制品：
  `qfy-test2:/srv/yuance/releases/yuance-api-linux-amd64.before-20260911162314.tar`。
- 迁移从 `applied=33 total=34` 执行到 `applied=34 total=34`，
  `202609110001 add browser refresh rotation recovery` 已成功应用。
- `seed core` 执行成功；未执行 demo seed 或 dangling image 清理。

## 发布后验证

- [x] SQLite 完整性：`ok`。
- [x] 迁移状态：`applied=34 total=34`，状态 `ok`。
- [x] `refresh_sessions`：备份与当前均为 `310` 条；轮换恢复三列已存在。
- [x] 文件对象审计：`total=140`、`attached=140`、`orphan=0`、
  `pending_orphan=0`、`uploaded_orphan=0`、`deleted_orphan=0`。
- [x] `yuance-api`：`running`、`healthy`，运行镜像与 `yuance-api:latest` 一致，
  摘要为 `sha256:f028ac0287fcc0503838094c64e2c569fbebeaac43e1a991d4380049cbbfe666`。
- [x] 公网 `/api/healthz`：HTTP `200`。
- [x] 公网 `/api/readyz`：HTTP `200`。
- [x] 公网 `/web`：HTTP `303`，符合未登录访问时跳转登录页的行为。
- [x] `qfy-sc-test` Nginx：`nginx -t` 通过，Yuance server block 数量为 `1`。

## 网关变更

正式应用入口 `/etc/nginx/conf.d/qfy-443-frp-web.conf` 已只替换
`yuance.quanxinfu.com` 对应的 server block，并执行 reload。原完整配置备份为：

`qfy-sc-test:/etc/nginx/conf.d/qfy-443-frp-web.conf.before-yuance-maintenance-20260911162009`

## 回滚

如出现阻断问题，先停止 `qfy-test2` 上的 API 写服务，加载本次旧镜像回滚制品并
重建容器；如果数据需要恢复，必须成组恢复 SQLite 主库、WAL、SHM，并重新执行
完整性、迁移状态、健康检查和文件对象审计。若网关配置需要恢复，使用上述 Nginx
完整配置备份，执行 `nginx -t` 后 reload。

本次迁移只增加刷新令牌轮换恢复字段，不提供向后回滚迁移；代码回滚前应确认旧版本
不会依赖新增字段，必要时以发布前 SQLite 备份恢复数据。

## 剩余观察项

- 本次未使用真实账号执行登录回归，原因是发布流程未提供生产凭据；已用会话数量、
  新字段和公网登录跳转行为完成无凭据核验。
- 继续观察容器日志、`healthz`、`readyz`、SQLite 磁盘空间和登录失败率。
