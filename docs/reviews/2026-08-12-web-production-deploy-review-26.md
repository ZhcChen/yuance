---
title: Web/API 正式环境部署复核（移除工作项详情页外层白色卡片容器）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（移除工作项详情页外层白色卡片容器）

## 结论

通过。工作项详情页已移除外层白色大卡片容器，恢复旧版透明、无内边距的展示方式；
Web 与 Desktop 共享的 app-shell 样式同步生效。正式环境公网健康检查、迁移、seed、
文件对象审计均正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `be28c4fcd21f78bffc270f1c5c282c237790c9a8`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-be28c4f.bundle`，scp 到 WSL 后 ff-only 同步发布源，
  随后执行 `./scripts/deploy-production.sh`。
- 相对上次发布 `28b69ef` 的内容：
  - `frontend/packages/app-shell/src/application.css` 中将
    `work-item-detail-center` 从通用大卡片规则中移除；
  - 详情页容器保留既有
    `max-width: 1440px; padding: 0; border-radius: 0; background: transparent;
    box-shadow: none`，不再被白色背景、内边距和阴影包裹；
  - 深色主题下同样不再套用卡片背景规则；
  - Web/Desktop 共用该样式，无需分别修改。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:4c705da0d6dd20b7acd8e9f841386c14d507fa574bec2749df8bb11385e312cd`，
  构建时间 2026-08-12T16:14:52+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `0934ca5d325fe3675be9b4016829d59e73f37d51adead4cd87ab4e7216649454`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=66 attached=66 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812161455.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812081456`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  `https://yuance.quanxinfu.com/web/app/assets/index-DpxZYjlD.css` 已包含
  `.work-item-detail-center{max-width:1440px;padding:0;border-radius:0;background:
  transparent;box-shadow:none}`，确认新样式已发布。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开任一工作项详情页。
2. 确认详情主内容不再被白色大卡片容器包裹，背景与页面主体一致、无额外内边距。
3. 确认详情页顶部无重复标题/刷新按钮，讨论区与附件区布局不变。
4. 切换浅色/深色主题，确认详情页两种主题下均无白色卡片背景。
