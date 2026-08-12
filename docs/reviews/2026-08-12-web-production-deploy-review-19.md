---
title: Web/API 正式环境部署复核（优先级红橙紫砂）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（优先级红橙紫砂）

## 结论

通过。工作项优先级已切换为红橙紫砂四级颜色方案，正式环境健康检查、迁移、
seed、文件对象审计均正常，正式前端资产包含 `violet` / `sand` 优先级样式。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `ec726bc`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-ec726bc.bundle`，
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `b63c34b` 的内容：`PriorityBadge` 改为 P0 danger、P1 warning、
  P2 violet、P3 sand；新增 `--yc-violet`、`--yc-sand` token 与对应 Badge 样式；
  同步 UI 规范与单测。仅前端包变更，完整发布管线仍重新执行。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:47dd5b5ae801d261c2e9ee19770ee7c3f64b1448c353d91f359679d6ec791be6`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812091459.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812011500`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页。
- 正式前端资产 `assets/index-DLXPYzJZ.js` 包含 `violet`、`sand` 映射与动态
  `yc-priority` class；`assets/index-D9jU2Ozt.css` 包含
  `.yc-badge-violet`、`.yc-badge-sand` 样式。

## 异常与恢复记录

- 本次 `docker compose run` 维护步骤正常返回，未复现 Compose 卡死；部署脚本
  全流程一次完成，无需手工恢复。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后进入工作项列表，确认 P0 红色、
   P1 橙色、P2 紫色、P3 暖砂。
2. 打开工作项详情，确认优先级标签与列表一致。
3. Desktop 通过共享前端自动同步，无需单独发布。
