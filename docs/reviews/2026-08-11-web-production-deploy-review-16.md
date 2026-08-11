---
title: Web/API 正式环境部署复核（全局表单与列表筛选紧凑样式）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（全局表单与列表筛选紧凑样式）

## 结论

通过。全局表单与列表筛选紧凑样式（32px / 13px）已发布到 WSL 正式环境，
公网健康检查、迁移、seed、文件对象审计均正常，正式 CSS 资产包含新样式 token。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `6b76038`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-6b76038.bundle`，
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `1933f4d` 的内容：全局表单控件与列表筛选组件统一
  （`frontend/packages/ui`、`frontend/packages/app-shell`），以及样式规范和
  复核文档；无 `api/` 运行时代码变更，完整发布管线仍重新执行。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:b93ab06f859bbcce2fd86eebfc24b8fe882af146acea41488cd104820da83bb0`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811231221.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811151222`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- 正式前端资产：
  - `assets/index-B2ajrSQx.js`
  - `assets/index-D26uUapR.css`
  - CSS 已确认包含 `--yc-control-height: 32px`、`.yc-filter-bar`、
    `.yc-button-sm`。

## 异常与恢复记录

- 部署脚本执行 `docker compose run` 维护容器（migrate/seed）时，
  Docker Compose v5.3.1 进程进入高 CPU 循环，维护容器已退出并被 `--rm` 清理，
  Compose CLI 仍不返回；900 秒 `timeout` 到期后部署脚本被终止。
- 主 `yuance-api` 容器在异常期间保持旧镜像运行，公网服务未中断。
- 手工恢复：使用一次性 `docker run --env-file .env` 容器完成
  `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功，
  健康检查与文件审计通过。
- 后续建议：下一次正式部署前先验证 `docker compose run` 是否仍卡死；
  若复现，可将维护步骤改为一次性 `docker run` 后继续发布，避免依赖
  Compose `run` 交互路径。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后检查工作项、项目资料库、系统权限、
   系统审计等列表筛选表单，控件高度与字体应为紧凑规格（32px / 13px）。
2. 检查搜索、重置等按钮高度与筛选表单一致。
3. Desktop 通过共享前端自动同步，无需单独发布。
