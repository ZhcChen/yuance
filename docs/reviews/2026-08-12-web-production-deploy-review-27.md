---
title: Web/API 正式环境部署复核（头像 hash 配色与讨论区按钮统一）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（头像 hash 配色与讨论区按钮统一）

## 结论

通过。全部用户头像已统一使用旧版 FNV-1a hash 配色，讨论发布区按钮与右侧
“指派 / 流转”按钮样式一致，详情说明残留标题已移除。正式环境公网健康检查、
迁移、seed、文件对象审计均正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `ae6014b2858825f511d44650dcfb21f5077ee210`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-ae6014b.bundle`（SHA256
  `eb6e2f1240243053727e31b908929c33db009a4e5f9bdf01429a2554d024371c`），
  scp 到 WSL 后 ff-only 同步发布源，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `be28c4f` 的内容：
  - 新增共享 `UserAvatar` 组件，统一 8 色 FNV-1a hash 头像背景色；
  - 顶部导航账户头像、个人资料头像、帖子发布人头像、讨论区头像全部走同一配色；
  - 移除详情说明残留的可见标题，改用 `aria-label` 保持无障碍语义；
  - 讨论发布区、回复区、编辑区、附件操作按钮迁移到共享 `Button`
    （`yc-button`），与右侧“指派 / 流转”按钮 UI 一致；
  - 移除旧版 `yuance-ui-button` 样式。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:a8a4024d373c73d99461653e81160f2cfad57b1127459185c11a6234e0d923c4`，
  构建时间 2026-08-12T16:35:23+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `8e2d8eb157ee78b9fdd141ec0222a31c15213490dc4cfe2578eb92e0ec91c852`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=66 attached=66 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812163526.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812083527`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：`/web/app/assets/index-B4IEdjpi.css` 与
  `/web/app/assets/index-DVoXYg1g.js` 已发布。
  - 线上 CSS 不再包含 `yuance-ui-button`；
  - 头像类样式保留形状尺寸，背景色改由 hash 内联样式提供；
  - 线上 JS 包含 `data-user-avatar` 与旧版头像色板。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开任一工作项详情页。
2. 确认发布人头像、讨论区头像、顶部导航头像均按用户名 hash 显示不同背景色，
   同一用户名在页面间颜色一致。
3. 确认发布人头像下方不再显示“详情说明”四个字。
4. 确认讨论发布区的“发表 / 发表并指派 / 添加附件”以及回复区按钮，与右侧
   “指派 / 流转”按钮高度、圆角、配色一致。
