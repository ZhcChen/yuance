---
title: Web/API 正式环境部署复核（工作项优先级分级颜色）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（工作项优先级分级颜色）

## 结论

通过。工作项优先级 P0-P3 分级颜色标签已发布到 WSL 正式环境，公网健康检查、
迁移、seed、文件对象审计均正常，正式 JS 资产包含 `P0-P3` 颜色映射。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `65d3c77`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-65d3c77.bundle`，
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `6b76038` 的内容：共享 `PriorityBadge`（P0 danger、P1 warning、
  P2 info、P3 success），工作项列表、周期看板与详情页统一接入；含 UI 规范与
  单测；无 `api/` 运行时代码变更，完整发布管线仍重新执行。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:9a0ab181d296e14c882a5af3ae56f07b3d8edfd646cdada011152e3641e69402`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812000325.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811160326`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页。
- 正式前端资产 `assets/index-Gkg_d2VD.js` 已确认包含
  `P0:"danger"`、`P1:"warning"`、`P2:"info"`、`P3:"success"` 映射及
  “未设置”默认文案。

## 异常与恢复记录

- 部署前 `docker compose run` 探针正常返回，但真实维护容器执行
  migrate/seed 后再次复现 Compose v5.3.1 卡死：容器已退出并被 `--rm` 清理，
  CLI 进程 208% CPU 空转不返回。
- 本次未等待 900 秒超时：确认维护容器已退出后，直接 SIGKILL 卡死的
  `timeout` / `docker compose` 链，主 `yuance-api` 容器在异常期间保持旧镜像
  运行，公网服务未中断。
- 手工恢复：使用一次性 `docker run --env-file .env` 容器完成
  `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功，
  健康检查与文件审计通过。
- 后续建议：正式部署脚本中的维护步骤改为一次性 `docker run`（与手工恢复
  路径一致），避免依赖 Compose `run` 交互路径；该问题已连续两次复现。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后进入工作项列表，确认优先级列
   P0 红色、P1 橙色、P2 蓝色、P3 绿色。
2. 打开工作项详情与周期状态看板，确认优先级标签颜色一致。
3. Desktop 通过共享前端自动同步，无需单独发布。
