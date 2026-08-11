---
title: Web/API 正式环境部署复核（会话恢复共享骨架屏）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（会话恢复共享骨架屏）

## 结论

通过。刷新页面时不再显示纯文字“正在恢复当前会话”，改为先展示统一的应用外壳
骨架屏；恢复状态提示保留为无障碍 live region。正式环境已上线。

## 设计决策

- 会话恢复是全局流程，只使用一套共享应用外壳骨架屏，不按页面重复设计。
- 页面数据加载继续使用现有按 `route.title` 的通用内容骨架。
- 只有列表/详情结构差异明显的页面才需要后续补充少量骨架变体。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `7e312f9`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `7e312f9` 后执行
  `./scripts/deploy-production.sh`。
- 提交：`7e312f9` 会话恢复阶段展示共享应用外壳骨架屏。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:0db4b8bbd97acb939b399f3a66881f750dc2b892b6fed90d7ae4420b57152a58`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate applied 30/total 30，`seed core` 成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811191430.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811111430`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 正式前端样式 `/web/app/assets/index-Dtk3DLZ-.css`：
  - 包含 `.app-shell-skeleton`、`.app-skeleton-nav`、`.app-skeleton-block`。
  - 包含 `@keyframes yc-app-shimmer` 与 reduced-motion 降级。
- 正式前端脚本 `/web/app/assets/index-DLCH-_yc.js`：
  - 包含“正在恢复当前会话，正在加载用户、项目上下文和消息状态。”的无障碍提示。

## 验收步骤

1. 登录后刷新任意 Web 页面。
2. 应先看到应用外壳骨架屏（顶栏、页面 Hero、卡片/表格占位），再进入真实页面。
3. 不再显示纯文字版“正在恢复会话”提示。
