---
title: Web/API 正式环境部署复核
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核

## 结论

通过。Web/API 单体已按正式部署规范发布到 WSL 正式环境，公网健康检查、登录入口、
下载页和工作项图片预览均验证通过。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，`main` = `cd92dc5`。
- 部署 commit 由正式 `origin/main`（`fd9266f`）合并当前 `dev`（`5ea2d1c`）生成，
  包含工作项主帖/评论附件预览能力解析、Desktop SPA IPC 受信、退出登录与设备凭证
  交互修复。
- 发布方式：离线 bundle 同步正式 WSL 发布源后执行 `./scripts/deploy-production.sh`，
  WSL 原生 Docker 构建 `linux/amd64` 镜像并发布。
- 未推送 GitHub `origin/main`，正式发布源与 GitHub 主线的同步留待主线回填阶段决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID `sha256:02b663f42aa2...`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status`、`migrate up`、`seed core` 执行成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：`/srv/yuance/releases/yuance-api-linux-amd64.before-20260811004618.tar`
  与发布前 SQLite 备份保留。

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok。
- `https://yuance.quanxinfu.com/api/readyz`：200，environment production。
- `GET /web`：303 跳转登录。
- `GET /web/downloads`：200。
- 工作项 `P260713713428-BUG-5` 评论 104 附件 69：
  - `/preview` 返回 kind=image、content_enabled=true。
  - `/preview/content` 返回 200，`content-type: image/png`，235464 字节，
    PNG 1909x1038。
- 正式前端 JS 资产包含 `openWorkItemCommentAttachmentPreview` 与
  `/preview/content` 路径，确认渲染修复已上线。

## 边界与后续

- 正式 WSL 访问能力已重新验证可用。
- 受限 `system_release:read/write` token 仍未配置；当前 `YUANCE_API_TOKEN`
  调用 system release API 返回 403，继续 G-DIST-DEV R2 前需创建专用 system token。
