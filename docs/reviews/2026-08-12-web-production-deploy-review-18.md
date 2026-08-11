---
title: Web/API 正式环境部署复核（优先级 P2/P3 中性灰弱化）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（优先级 P2/P3 中性灰弱化）

## 结论

通过。工作项优先级 P2/P3 已改为中性灰弱化展示，正式环境健康检查、迁移、
seed、文件对象审计均正常，正式前端资产包含 `yc-priority-*` 逻辑与
`.yc-priority-P3` 样式。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `b63c34b`。
- 发布方式：本地离线 bundle ff-only 同步到 `b63c34b` 后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `65d3c77` 的内容：`PriorityBadge` 调整为 P0 danger、P1 warning、
  P2/P3 neutral；新增 `yc-priority-*` class 与 P3 浅灰弱化样式；同步 UI 规范
  与单测。仅前端包变更，完整发布管线仍重新执行。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:e61c1250a14ba9dfbc7bc8050ec5a25204a8062594cf04140b9515b188a41ff1`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812003031.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811163032`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页。
- 正式前端资产 `assets/index-DmOwx_pD.js` 包含动态 `yc-priority-*` class；
  `assets/index-DR2GpQMO.css` 包含 `.yc-priority-P3` 样式。

## 异常与恢复记录

- `docker compose run` 维护步骤第三次复现 Compose v5.3.1 卡死：维护容器已退出
  并被 `--rm` 清理，CLI 进程约 206% CPU 空转不返回。
- 未等待 900 秒超时：确认维护容器不存在后，直接 SIGKILL 卡死的
  `timeout` / `docker compose` 链；主 `yuance-api` 在恢复期间保持旧镜像运行，
  公网服务未中断。
- 手工恢复：使用一次性 `docker run --env-file .env` 容器完成
  `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功，
  健康检查与文件审计通过。
- 建议尽快将部署脚本维护步骤改为一次性 `docker run`，避免继续依赖 Compose
  `run` 交互路径。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后进入工作项列表，确认 P0 红色、
   P1 橙色、P2/P3 中性灰弱化。
2. 打开工作项详情，确认优先级标签与列表一致。
3. Desktop 通过共享前端自动同步，无需单独发布。
